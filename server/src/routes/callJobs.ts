import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import { buildExportWorkbook, validateCallInput } from '../services/excel.js'
import { runCall as runCallWithGuards, type RunnableCallJob } from '../services/callExecution.js'
import { canTransitionCallStatus } from '../services/callStatusTransitions.js'

export const callJobsRouter = Router()

callJobsRouter.get('/call-jobs', async (_req, res) => {
  try {
    const jobs = await prisma.callJob.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(jobs.map((job) => ({
      ...job,
      recordingUrl: job.recordingUrl ?? null,
      recordingSid: job.recordingSid ?? null,
      recordingDuration: job.recordingDuration ?? null,
    })))
  } catch {
    res.json([])
  }
})

callJobsRouter.post('/call-jobs', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const rawCost = body.prescriptionCost != null ? Number(body.prescriptionCost) : undefined
    const row = validateCallInput({
      patientName: String(body.patientName ?? body.patient_name ?? ''),
      phoneNumber: String(body.phoneNumber ?? body.phone_number ?? ''),
      dob: String(body.dob ?? ''),
      medicationName: String(body.medicationName ?? body.medication_name ?? ''),
      callReason: String(body.callReason ?? body.call_reason ?? 'general_callback'),
      notes: body.notes != null ? String(body.notes) : null,
      prescriptionCost: rawCost != null && !Number.isNaN(rawCost) ? rawCost : null,
      prescriptionsJson: body.prescriptionsJson != null ? String(body.prescriptionsJson) : null,
    })

    const data = {
      patientName: row.patientName,
      phoneNumber: row.phoneNumber,
      dob: row.dob,
      medicationName: row.medicationName,
      rxNumber: body.rxNumber != null ? String(body.rxNumber).trim() || null : null,
      callReason: row.callReason,
      notes: row.notes,
      prescriptionCost: row.prescriptionCost,
      prescriptionsJson: row.prescriptionsJson,
      validationStatus: row.validationStatus,
      validationError: row.validationError,
      callStatus: row.validationStatus === 'valid' ? 'queued' : 'invalid',
    }

    const job = await prisma.callJob.create({ data }).catch(() => ({
      id: `stateless_${Date.now()}`,
      ...data,
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

callJobsRouter.get('/call-jobs/export', async (_req, res) => {
  const jobs = await prisma.callJob.findMany({ orderBy: { createdAt: 'desc' } }).catch(() => [])
  const buffer = buildExportWorkbook(jobs)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=pharmaflow-call-results.xlsx')
  res.send(buffer)
})

callJobsRouter.get('/call-jobs/scheduler-status', async (_req, res) => {
  try {
    const now = new Date()
    const jobSelect = {
      id: true,
      patientName: true,
      phoneNumber: true,
      medicationName: true,
      callReason: true,
      scheduledFor: true,
      retryAttempt: true,
      maxRetryAttempts: true,
      retryStatus: true,
      callStatus: true,
    } as const

    const [pendingBatch, pendingRetry] = await Promise.all([
      prisma.callJob.findMany({
        where: {
          callStatus: 'scheduled',
          retryOfCallJobId: null,
          validationStatus: 'valid',
        },
        select: jobSelect,
        orderBy: { scheduledFor: 'asc' },
        take: 50,
      }),
      prisma.callJob.findMany({
        where: {
          retryStatus: 'scheduled',
          retryOfCallJobId: { not: null },
          callStatus: { in: ['scheduled', 'queued'] },
        },
        select: jobSelect,
        orderBy: { scheduledFor: 'asc' },
        take: 50,
      }),
    ])
    const isDue = (j: { scheduledFor: Date | null }) =>
      j.scheduledFor !== null && j.scheduledFor <= now
    res.json({
      now: now.toISOString(),
      batchScheduled: pendingBatch.length,
      batchDue: pendingBatch.filter(isDue).length,
      retryScheduled: pendingRetry.length,
      retryDue: pendingRetry.filter(isDue).length,
      nextBatch: pendingBatch[0]?.scheduledFor?.toISOString() ?? null,
      nextRetry: pendingRetry[0]?.scheduledFor?.toISOString() ?? null,
      batchJobs: pendingBatch,
      retryJobs: pendingRetry,
    })
  } catch {
    res.json({ error: 'Could not read scheduler status' })
  }
})

callJobsRouter.post('/call-jobs/schedule-queued', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const scheduledForRaw = String(body.scheduledFor ?? '')
    const scheduledFor = new Date(scheduledForRaw)
    if (!scheduledForRaw || Number.isNaN(scheduledFor.getTime())) {
      res.status(400).json({ error: 'scheduledFor must be a valid ISO date.' })
      return
    }
    const requestedIds = Array.isArray(body.callJobIds)
      ? body.callJobIds.map((id) => String(id)).filter(Boolean)
      : []

    const eligibleJobs = await prisma.callJob.findMany({
      where: {
        validationStatus: 'valid',
        callStatus: 'queued',
        twilioCallSid: null,
        ...(requestedIds.length > 0 ? { id: { in: requestedIds } } : {}),
      },
      select: { id: true },
    })
    const ids = eligibleJobs.map((job) => job.id)
    if (ids.length === 0) {
      res.json({ scheduledFor: scheduledFor.toISOString(), count: 0, jobs: [] })
      return
    }

    await prisma.callJob.updateMany({
      where: { id: { in: ids } },
      data: {
        callStatus: 'scheduled',
        scheduledFor,
        retryStatus: 'scheduled',
        retryReason: 'Batch scheduled from dashboard',
      },
    })

    await prisma.auditEvent
      .create({
        data: {
          entityType: 'call_job',
          entityId: 'batch',
          action: 'batch_calls_scheduled',
          actor: 'dashboard',
          message: `${ids.length} queued call job${ids.length === 1 ? '' : 's'} scheduled from dashboard.`,
          metadataJson: JSON.stringify({ scheduledFor: scheduledFor.toISOString(), count: ids.length }),
        },
      })
      .catch(() => null)

    const jobs = await prisma.callJob.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ scheduledFor: scheduledFor.toISOString(), count: jobs.length, jobs })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Schedule queued calls failed' })
  }
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
  res.json(job)
})

const EDITABLE_CALL_STATUSES = new Set([
  'queued',
  'in_progress',
  'completed',
  'no_answer',
  'failed',
  'escalated',
  'callback_requested',
  'voicemail',
  'needs_review',
])

function twilioRecordingAuthHeader(): string | null {
  const apiKey = config.twilioApiKeySid.trim()
  const apiSecret = config.twilioApiKeySecret.trim()
  if (apiKey.startsWith('SK') && apiSecret) {
    return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`
  }
  if (config.twilioAccountSid && config.twilioAuthToken) {
    return `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64')}`
  }
  return null
}

callJobsRouter.patch('/call-jobs/:id', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const status = body.callStatus != null ? String(body.callStatus) : undefined
    const notes = body.notes != null ? String(body.notes) : undefined
    const staffNotes = body.staffNotes != null ? String(body.staffNotes) : undefined
    const followUpReason = body.followUpReason != null ? String(body.followUpReason) : undefined

    if (status && !EDITABLE_CALL_STATUSES.has(status)) {
      res.status(400).json({ error: `Invalid callStatus. Allowed: ${[...EDITABLE_CALL_STATUSES].join(', ')}` })
      return
    }

    // Validate transition (manual_update is always allowed; guard is wired for future constraints)
    if (status) {
      const current = await prisma.callJob.findUnique({ where: { id: req.params.id }, select: { callStatus: true } })
      if (!current) { res.status(404).json({ error: 'Call job not found' }); return }
      const transition = canTransitionCallStatus(current.callStatus, status, 'manual_update')
      if (!transition.allowed) {
        res.status(409).json({ error: transition.reason ?? 'Status transition not allowed' })
        return
      }
    }

    const data: Parameters<typeof prisma.callJob.update>[0]['data'] = {}
    if (status) data.callStatus = status
    if (notes !== undefined) data.notes = notes || null
    if (staffNotes !== undefined) data.staffNotes = staffNotes || null
    if (followUpReason !== undefined) data.followUpReason = followUpReason || null

    if (status === 'completed') {
      data.callCompletedAt = new Date()
      data.resolutionStatus = 'resolved'
      data.staffFollowUpNeeded = false
    }
    if (status === 'escalated') {
      data.resolutionStatus = 'escalated'
      data.staffFollowUpNeeded = true
      if (!followUpReason) data.followUpReason = 'Manually escalated by staff'
    }
    if (status === 'callback_requested') {
      data.resolutionStatus = 'escalated'
      data.staffFollowUpNeeded = true
      if (!followUpReason) data.followUpReason = 'Callback requested'
    }
    if (status === 'failed' || status === 'no_answer') {
      data.resolutionStatus = 'pending'
      data.staffFollowUpNeeded = true
      if (!followUpReason) data.followUpReason = `Call ${status.replace(/_/g, ' ')} — staff review needed`
    }
    if (status === 'voicemail') {
      data.resolutionStatus = 'pending'
      data.staffFollowUpNeeded = true
      if (!followUpReason) data.followUpReason = 'Left voicemail — awaiting callback'
    }
    if (status === 'queued' || status === 'in_progress') {
      data.staffFollowUpNeeded = false
      data.followUpReason = null
      data.callCompletedAt = null
      data.resolutionStatus = null
    }

    const job = await prisma.callJob.update({ where: { id: req.params.id }, data })
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Update failed' })
  }
})

callJobsRouter.delete('/call-jobs/:id', async (req, res) => {
  try {
    const id = req.params.id
    const tasks = await prisma.staffTask.findMany({ where: { callJobId: id }, select: { id: true } })
    const taskIds = tasks.map((task) => task.id)
    if (taskIds.length > 0) {
      await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } })
    }
    await prisma.callEvent.deleteMany({ where: { callJobId: id } })
    await prisma.staffTask.deleteMany({ where: { callJobId: id } })
    await prisma.callJob.delete({ where: { id } })
    res.status(204).end()
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Delete failed' })
  }
})

callJobsRouter.post('/call-jobs/:id/complete', async (req, res) => {
  try {
    const completedBy = String((req.body as Record<string, unknown>).completedBy ?? '').trim()
    if (!completedBy) {
      res.status(400).json({ error: 'completedBy is required' })
      return
    }
    const now = new Date()
    const job = await prisma.callJob.update({
      where: { id: req.params.id },
      data: {
        staffCompleted: true,
        staffCompletedAt: now,
        staffCompletedBy: completedBy,
      },
    })
    await prisma.staffTask.updateMany({
      where: { callJobId: req.params.id, status: { in: ['open', 'in_progress'] } },
      data: { status: 'resolved', completedAt: now },
    })
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Staff completion failed' })
  }
})

function fallbackJobFromBody(jobId: string, body?: Record<string, unknown>): RunnableCallJob | null {
  const raw = body?.job
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
    prescriptionCost:
      job.prescriptionCost != null && !Number.isNaN(Number(job.prescriptionCost))
        ? Number(job.prescriptionCost)
        : null,
    prescriptionsJson: job.prescriptionsJson ? String(job.prescriptionsJson) : null,
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
    const job = await runCallWithGuards(callJobId, fallbackJobFromBody(callJobId, body))
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Start call failed' })
  }
})

callJobsRouter.post('/call-jobs/:id/start-call', async (req, res) => {
  const jobId = req.params.id
  if (!jobId) { res.status(400).json({ error: 'ID required' }); return }
  try {
    const job = await runCallWithGuards(jobId, fallbackJobFromBody(jobId, req.body as Record<string, unknown>))
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Start call failed' })
  }
})

callJobsRouter.post('/call-jobs/:id/retry', async (req, res) => {
  const jobId = req.params.id
  if (!jobId) { res.status(400).json({ error: 'ID required' }); return }
  try {
    await prisma.callJob.update({
      where: { id: jobId },
      data: {
        callStatus: 'queued',
        twilioCallSid: null,
        callAttemptedAt: null,
        callCompletedAt: null,
        callDuration: null,
        errorMessage: null,
      },
    }).catch(() => null)
    const job = await runCallWithGuards(
      jobId,
      fallbackJobFromBody(jobId, req.body as Record<string, unknown>),
      { force: true },
    )
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Retry failed' })
  }
})

callJobsRouter.post('/call-jobs/:id/cancel-retry', async (req, res) => {
  const jobId = req.params.id
  if (!jobId) { res.status(400).json({ error: 'ID required' }); return }
  try {
    const job = await prisma.callJob.update({
      where: { id: jobId },
      data: {
        retryStatus: 'cancelled',
        callStatus: 'queued',
        scheduledFor: null,
        retryReason: 'Cancelled by staff',
      },
    })
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Cancel retry failed' })
  }
})

// Proxy Twilio recording audio — avoids exposing credentials to browser
callJobsRouter.get('/call-jobs/:id/recording/audio', async (req, res) => {
  try {
    const job = await prisma.callJob.findUnique({ where: { id: req.params.id }, select: { recordingUrl: true } })
    if (!job?.recordingUrl) { res.status(404).json({ error: 'No recording available' }); return }
    const authHeader = twilioRecordingAuthHeader()
    if (!authHeader) {
      res.status(503).json({ error: 'Recording playback is not configured for this environment.' })
      return
    }
    const upstream = await fetch(job.recordingUrl, { headers: { Authorization: authHeader } })
    if (!upstream.ok) { res.status(502).json({ error: 'Recording fetch failed' }); return }
    res.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'audio/mpeg')
    const cl = upstream.headers.get('Content-Length')
    if (cl) res.setHeader('Content-Length', cl)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    const { Readable } = await import('stream')
    if (upstream.body) Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
    else res.status(502).json({ error: 'No audio stream' })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Recording error' })
  }
})
