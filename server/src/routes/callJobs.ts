import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { buildExportWorkbook, validateCallInput } from '../services/excel.js'
import { formatScriptForPreview, getCallScript } from '../services/callScripts.js'
import { normalizePhone } from '../services/safety.js'
import { config, type CallReason } from '../config.js'
import { scriptContextFromJob } from '../services/twilioFlow.js'
import { runCall, type RunnableCallJob } from '../services/callExecution.js'
import {
  buildRetryEnrichment,
  runDueScheduledRetries,
  scheduleRetryCallJob,
} from '../services/retrySchedule.js'
import {
  getFinalOutcome,
  getRetryRecommendation,
  mapCallReasonToTaskType,
  mapCallReasonToWorkflow,
} from '../services/callOutcome.js'

export const callJobsRouter = Router()

function enrichCallJob<T extends Record<string, unknown>>(job: T) {
  const callStatus = String(job.callStatus ?? 'queued')
  const enriched = {
    ...job,
    finalOutcome: getFinalOutcome({
      callStatus,
      staffFollowUpNeeded: Boolean(job.staffFollowUpNeeded),
      followUpReason: job.followUpReason as string | null | undefined,
      patientResponse: job.patientResponse as string | null | undefined,
      errorMessage: job.errorMessage as string | null | undefined,
      callCompletedAt: job.callCompletedAt as Date | string | null | undefined,
      callAttemptedAt: job.callAttemptedAt as Date | string | null | undefined,
    }),
    retryRecommendation: getRetryRecommendation({
      callStatus,
      staffFollowUpNeeded: Boolean(job.staffFollowUpNeeded),
      followUpReason: job.followUpReason as string | null | undefined,
      patientResponse: job.patientResponse as string | null | undefined,
      errorMessage: job.errorMessage as string | null | undefined,
      callCompletedAt: job.callCompletedAt as Date | string | null | undefined,
      callAttemptedAt: job.callAttemptedAt as Date | string | null | undefined,
    }),
  }
  return enriched
}

callJobsRouter.get('/call-jobs', async (_req, res) => {
  try {
    const jobs = await prisma.callJob.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        callEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
        staffTasks: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })
    const retryMeta = await buildRetryEnrichment(jobs)
    res.json(
      jobs.map((job) => ({
        ...enrichCallJob(job),
        ...retryMeta.get(job.id),
      })),
    )
  } catch {
    res.json([])
  }
})

function duplicateKey(params: { phoneNumber: string; dob: string; medicationName: string }): string {
  return [
    normalizePhone(params.phoneNumber) ?? params.phoneNumber.trim(),
    params.dob.replace(/\D/g, ''),
    params.medicationName.trim().toLowerCase(),
  ].join('|')
}

async function findSafetyFlags(params: {
  phoneNumber: string
  dob: string
  medicationName: string
  excludeId?: string
}) {
  const normalizedPhone = normalizePhone(params.phoneNumber) ?? params.phoneNumber.trim()
  const [dnc, duplicate] = await Promise.all([
    prisma.doNotCallEntry.findUnique({ where: { phoneNumber: normalizedPhone } }).catch(() => null),
    prisma.callJob
      .findFirst({
        where: {
          phoneNumber: normalizedPhone,
          dob: params.dob,
          medicationName: params.medicationName,
          ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
          callStatus: { notIn: ['completed', 'resolved', 'cancelled'] },
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => null),
  ])
  const flags = [
    ...(dnc ? [`Do-not-call: ${dnc.reason ?? 'listed number'}`] : []),
    ...(duplicate ? [`Possible duplicate of ${duplicate.patientName}`] : []),
  ]
  return { dnc, duplicate, flags }
}

const MANUAL_TERMINAL_STATUSES = new Set([
  'completed',
  'resolved',
  'failed',
  'no_answer',
  'busy',
  'cancelled',
  'callback_requested',
  'escalated',
  'voicemail',
  'scheduled',
])

callJobsRouter.post('/call-jobs', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const row = validateCallInput({
      patientName: String(body.patientName ?? body.patient_name ?? ''),
      phoneNumber: String(body.phoneNumber ?? body.phone_number ?? ''),
      dob: String(body.dob ?? ''),
      medicationName: String(body.medicationName ?? body.medication_name ?? ''),
      callReason: String(body.callReason ?? body.call_reason ?? 'general_callback'),
      notes: body.notes != null ? String(body.notes) : null,
    })

    const data = {
      patientName: row.patientName,
      phoneNumber: row.phoneNumber,
      dob: row.dob,
      medicationName: row.medicationName,
      callReason: row.callReason,
      notes: row.notes,
      validationStatus: row.validationStatus,
      validationError: row.validationError,
      callStatus: row.validationStatus === 'valid' ? 'queued' : 'invalid',
    }

    const safety = await findSafetyFlags({
      phoneNumber: row.phoneNumber,
      dob: row.dob,
      medicationName: row.medicationName,
    })
    const createData = {
      ...data,
      doNotCall: Boolean(safety.dnc),
      duplicateOfId: safety.duplicate?.id ?? null,
      safetyFlagsJson: safety.flags.length ? JSON.stringify(safety.flags) : null,
      validationStatus: safety.dnc ? 'invalid' : data.validationStatus,
      validationError: safety.dnc ? safety.flags[0] : data.validationError,
      callStatus: safety.dnc ? 'blocked' : data.callStatus,
    }

    const job = await prisma.callJob.create({ data: createData }).catch(() => ({
      id: `stateless_${Date.now()}`,
      ...createData,
      twilioCallSid: null,
      callAttemptedAt: null,
      callCompletedAt: null,
      callDuration: null,
      patientResponse: null,
      aiSummary: null,
      errorMessage: null,
      transcriptJson: null,
      messagesJson: null,
      aiConfidence: null,
      resolutionStatus: null,
      resolvedAt: null,
      resolvedBy: null,
      staffNotes: null,
      staffFollowUpNeeded: false,
      followUpReason: null,
      smsStatus: 'none',
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    res.status(201).json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' })
  }
})

callJobsRouter.get('/upload-batches', async (_req, res) => {
  const batches = await prisma.uploadBatch
    .findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
    .catch(() => [])
  res.json(batches)
})

callJobsRouter.get('/do-not-call', async (_req, res) => {
  const rows = await prisma.doNotCallEntry
    .findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    .catch(() => [])
  res.json(rows)
})

callJobsRouter.post('/do-not-call', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const phoneNumber = normalizePhone(String(body.phoneNumber ?? '')) ?? String(body.phoneNumber ?? '').trim()
    if (!phoneNumber) {
      res.status(400).json({ error: 'phoneNumber is required' })
      return
    }
    const row = await prisma.doNotCallEntry.upsert({
      where: { phoneNumber },
      update: {
        patientName: body.patientName ? String(body.patientName) : undefined,
        reason: body.reason ? String(body.reason) : undefined,
      },
      create: {
        phoneNumber,
        patientName: body.patientName ? String(body.patientName) : null,
        reason: body.reason ? String(body.reason) : 'Patient should not be called',
        createdBy: body.createdBy ? String(body.createdBy) : 'staff',
      },
    })
    await prisma.callJob.updateMany({
      where: { phoneNumber },
      data: {
        doNotCall: true,
        callStatus: 'blocked',
        validationStatus: 'invalid',
        validationError: row.reason ?? 'Do-not-call number',
      },
    }).catch(() => null)
    res.status(201).json(row)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not add do-not-call entry' })
  }
})

callJobsRouter.get('/call-jobs/export', async (_req, res) => {
  const jobs = await prisma.callJob.findMany({ orderBy: { createdAt: 'desc' } }).catch(() => [])
  const buffer = buildExportWorkbook(jobs)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=pharmaflow-call-results.xlsx')
  res.send(buffer)
})

callJobsRouter.get('/call-jobs/:id', async (req, res) => {
  const job = await prisma.callJob.findUnique({
    where: { id: req.params.id },
    include: { callEvents: true, staffTasks: true },
  })
  if (!job) {
    res.status(404).json({ error: 'Call job not found' })
    return
  }
  const retryMeta = await buildRetryEnrichment([job])
  res.json({
    ...enrichCallJob(job),
    ...retryMeta.get(job.id),
  })
})

callJobsRouter.get('/call-jobs/:id/script', async (req, res) => {
  const job = await prisma.callJob.findUnique({ where: { id: req.params.id } }).catch(() => null)
  if (!job) {
    res.status(404).json({ error: 'Call job not found' })
    return
  }
  res.json({
    callJobId: job.id,
    mode: config.callMode,
    script: formatScriptForPreview(job.callReason as CallReason, scriptContextFromJob(job)),
  })
})

callJobsRouter.patch('/call-jobs/:id', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const fallback = fallbackJobFromBody(req.params.id!, body)
    if (!fallback) {
      const existing = await prisma.callJob.findUnique({ where: { id: req.params.id } }).catch(() => null)
      if (!existing) {
        res.status(404).json({ error: 'Call job not found. Refresh the page or add this patient again.' })
        return
      }
    }
    const callStatus = body.callStatus !== undefined ? String(body.callStatus) : undefined
    const shouldComplete =
      callStatus !== undefined && MANUAL_TERMINAL_STATUSES.has(callStatus)
    const updateData = {
      ...(callStatus !== undefined && { callStatus }),
      ...(callStatus === 'resolved' && {
        resolutionStatus: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: body.resolvedBy ? String(body.resolvedBy) : 'staff',
      }),
      ...(body.resolutionStatus !== undefined && {
        resolutionStatus: body.resolutionStatus == null ? null : String(body.resolutionStatus),
      }),
      ...(shouldComplete && { callCompletedAt: new Date() }),
      ...(body.notes !== undefined && { notes: body.notes == null ? null : String(body.notes) }),
      ...(body.staffNotes !== undefined && { staffNotes: body.staffNotes == null ? null : String(body.staffNotes) }),
      ...(body.staffFollowUpNeeded !== undefined && { staffFollowUpNeeded: Boolean(body.staffFollowUpNeeded) }),
      ...(body.followUpReason !== undefined && { followUpReason: body.followUpReason == null ? null : String(body.followUpReason) }),
    }
    const createData = fallback
      ? {
          id: req.params.id,
          patientName: fallback.patientName || 'Unknown patient',
          phoneNumber: fallback.phoneNumber || 'unknown',
          dob: fallback.dob || '',
          medicationName: fallback.medicationName || '',
          callReason: fallback.callReason || 'general_callback',
          validationStatus: fallback.validationStatus || 'valid',
          callStatus: fallback.callStatus || 'queued',
          twilioCallSid: fallback.twilioCallSid,
          callAttemptedAt: fallback.callAttemptedAt ? new Date(fallback.callAttemptedAt) : null,
          ...updateData,
        }
      : undefined
    const job = fallback
      ? await prisma.callJob.upsert({
          where: { id: req.params.id },
          update: updateData,
          create: createData!,
          include: { callEvents: { orderBy: { createdAt: 'desc' }, take: 20 }, staffTasks: true },
        })
      : await prisma.callJob.update({
      where: { id: req.params.id },
      data: updateData,
      include: { callEvents: { orderBy: { createdAt: 'desc' }, take: 20 }, staffTasks: true },
    })
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Update failed' })
  }
})

callJobsRouter.post('/call-jobs/:id/resolve', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const job = await prisma.callJob.update({
      where: { id: req.params.id },
      data: {
        callStatus: 'resolved',
        resolutionStatus: 'resolved',
        staffFollowUpNeeded: false,
        followUpReason: null,
        resolvedAt: new Date(),
        resolvedBy: body.resolvedBy ? String(body.resolvedBy) : 'staff',
        staffNotes: body.staffNotes ? String(body.staffNotes) : undefined,
      },
      include: { callEvents: { orderBy: { createdAt: 'desc' }, take: 20 }, staffTasks: true },
    })
    await createCallEventIfPossible({
      callJobId: job.id,
      twilioCallSid: job.twilioCallSid,
      eventType: 'manual_resolved',
      eventPayload: JSON.stringify({ resolvedBy: job.resolvedBy }),
    })
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Resolve failed' })
  }
})

function fallbackJobFromBody(jobId: string, body: Record<string, unknown>): RunnableCallJob | null {
  const raw = body.job
  if (!raw || typeof raw !== 'object') return null
  const job = raw as Record<string, unknown>
  return {
    id: String(job.id ?? jobId),
    patientName: String(job.patientName ?? ''),
    phoneNumber: String(job.phoneNumber ?? ''),
    dob: String(job.dob ?? ''),
    medicationName: String(job.medicationName ?? ''),
    callReason: String(job.callReason ?? 'general_callback'),
    validationStatus: String(job.validationStatus ?? 'valid'),
    callStatus: String(job.callStatus ?? 'queued'),
    twilioCallSid: job.twilioCallSid ? String(job.twilioCallSid) : null,
    callAttemptedAt: job.callAttemptedAt ? String(job.callAttemptedAt) : null,
    doNotCall: Boolean(job.doNotCall),
  }
}

async function updateCallJobIfPresent(jobId: string, data: Parameters<typeof prisma.callJob.update>[0]['data']) {
  try {
    await prisma.callJob.update({ where: { id: jobId }, data })
  } catch {
    // Vercel demo SQLite can lose rows between serverless invocations; the live Twilio call can still proceed.
  }
}

async function createCallEventIfPossible(data: Parameters<typeof prisma.callEvent.create>[0]['data']) {
  try {
    await prisma.callEvent.create({ data })
  } catch {
    // Non-durable Vercel demo DB fallback.
  }
}

callJobsRouter.post('/calls/start', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const callJobId = String(body.call_job_id ?? body.callJobId ?? '')
    if (!callJobId) {
      res.status(400).json({ error: 'call_job_id is required' })
      return
    }
    const job = await runCall(callJobId, fallbackJobFromBody(callJobId, body))
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Start call failed' })
  }
})

callJobsRouter.post('/call-jobs/:id/start-call', async (req, res) => {
  try {
    const job = await runCall(req.params.id!, fallbackJobFromBody(req.params.id!, req.body as Record<string, unknown>))
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Start call failed' })
  }
})

callJobsRouter.post('/call-jobs/:id/follow-up-task', async (req, res) => {
  try {
    const job = await prisma.callJob.findUnique({
      where: { id: req.params.id },
      include: {
        staffTasks: {
          where: { status: { notIn: ['completed', 'cancelled'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!job) {
      res.status(404).json({ error: 'Call job not found' })
      return
    }

    if (job.staffTasks.length > 0) {
      res.json({ task: job.staffTasks[0], created: false })
      return
    }

    const outcome = getFinalOutcome(job)
    const retry = getRetryRecommendation(job)
    const priority =
      job.callStatus === 'escalated' || job.callStatus === 'failed'
        ? 'high'
        : job.callStatus === 'no_answer' || job.callStatus === 'busy'
          ? 'normal'
          : 'normal'

    const task = await prisma.staffTask.create({
      data: {
        callJobId: job.id,
        patientName: job.patientName,
        phoneNumber: job.phoneNumber,
        medicationName: job.medicationName,
        taskType: mapCallReasonToTaskType(job.callReason, job.callStatus),
        priority,
        status: 'open',
        notes: job.followUpReason ?? retry.reason,
        aiSummary: job.aiSummary,
        assignedTeam: 'Unassigned',
        dueDate: new Date().toISOString().slice(0, 10),
        dueTime: '15:00',
        sourceWorkflow: mapCallReasonToWorkflow(job.callReason),
        issueSummary: job.followUpReason ?? `${outcome}: ${retry.reason}`,
        activityJson: JSON.stringify([
          {
            id: `act-${Date.now()}`,
            type: 'created',
            message: `Follow-up task created from call outcome (${outcome}).`,
            timestamp: new Date().toISOString(),
            actor: 'System',
          },
        ]),
      },
    })

    await createCallEventIfPossible({
      callJobId: job.id,
      twilioCallSid: job.twilioCallSid,
      eventType: 'follow_up_task_created',
      eventPayload: JSON.stringify({ taskId: task.id, outcome }),
    })

    await prisma.auditEvent
      .create({
        data: {
          entityType: 'staff_task',
          entityId: task.id,
          action: 'TASK_CREATED_FROM_CALL',
          actor: 'workflow-engine',
          message: `Follow-up task created from call job ${job.id}.`,
          metadataJson: JSON.stringify({ callJobId: job.id, outcome, callStatus: job.callStatus }),
        },
      })
      .catch(() => null)

    await updateCallJobIfPresent(job.id, {
      staffFollowUpNeeded: true,
      followUpReason: job.followUpReason ?? retry.reason,
    })

    res.status(201).json({ task, created: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not create follow-up task' })
  }
})

callJobsRouter.post('/call-jobs/:id/retry', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const result = await scheduleRetryCallJob(req.params.id!, {
      scheduledFor: body.scheduledFor != null ? String(body.scheduledFor) : undefined,
      reason: body.reason != null ? String(body.reason) : undefined,
      placeImmediately: Boolean(body.placeImmediately),
      createFollowUpTask: Boolean(body.createFollowUpTask),
    })

    const retryMeta = result.retryCallJob
      ? await buildRetryEnrichment([result.retryCallJob, result.originalCallJob])
      : await buildRetryEnrichment([result.originalCallJob])

    res.json({
      ok: true,
      existing: result.existing,
      originalCallJob: {
        ...enrichCallJob(result.originalCallJob),
        ...retryMeta.get(result.originalCallJob.id),
      },
      retryCallJob: result.retryCallJob
        ? {
            ...enrichCallJob(result.retryCallJob),
            ...retryMeta.get(result.retryCallJob.id),
          }
        : null,
      retryRecommendation: result.retryRecommendation,
      followUpTask: 'followUpTask' in result ? result.followUpTask : undefined,
    })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Retry failed' })
  }
})

callJobsRouter.post('/call-jobs/run-due-retries', async (req, res) => {
  const secret = process.env.INTERNAL_CRON_SECRET?.trim()
  const provided = req.header('x-internal-cron-secret')?.trim()
  if (secret && provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const result = await runDueScheduledRetries()
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not run due retries' })
  }
})
