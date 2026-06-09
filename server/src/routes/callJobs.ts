import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { buildExportWorkbook, validateCallInput } from '../services/excel.js'
import { getCallScript } from '../services/callScripts.js'
import { buildAiSummary } from '../services/script.js'
import { needsStaffFollowUp } from '../services/safety.js'
import { startOutboundCall } from '../services/twilio.js'
import { config, type CallReason } from '../config.js'

export const callJobsRouter = Router()

callJobsRouter.get('/call-jobs', async (_req, res) => {
  try {
    const jobs = await prisma.callJob.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(jobs)
  } catch {
    res.json([])
  }
})

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
])

callJobsRouter.patch('/call-jobs/:id', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const status = body.callStatus != null ? String(body.callStatus) : undefined
    const notes = body.notes != null ? String(body.notes) : undefined
    const followUpReason = body.followUpReason != null ? String(body.followUpReason) : undefined

    if (status && !EDITABLE_CALL_STATUSES.has(status)) {
      res.status(400).json({ error: `Invalid callStatus. Allowed: ${[...EDITABLE_CALL_STATUSES].join(', ')}` })
      return
    }

    const data: Parameters<typeof prisma.callJob.update>[0]['data'] = {}
    if (status) data.callStatus = status
    if (notes !== undefined) data.notes = notes || null
    if (followUpReason !== undefined) data.followUpReason = followUpReason || null
    if (status === 'completed') data.callCompletedAt = new Date()
    if (status === 'failed' || status === 'no_answer' || status === 'escalated' || status === 'callback_requested') {
      data.staffFollowUpNeeded = true
      if (!data.followUpReason) data.followUpReason = `Updated status to ${status}`
    }
    if (status === 'queued') {
      data.staffFollowUpNeeded = false
      data.followUpReason = null
      data.callCompletedAt = null
    }

    const job = await prisma.callJob.update({ where: { id: req.params.id }, data })
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Update failed' })
  }
})

const ACTIVE_CALL_STATUSES = new Set(['dialing', 'queued_live', 'ringing', 'in_progress'])

type RunnableCallJob = {
  id: string
  patientName: string
  phoneNumber: string
  dob: string
  medicationName: string
  callReason: string
  validationStatus: string
  callStatus: string
  twilioCallSid: string | null
  callAttemptedAt?: Date | string | null
}

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

async function createStaffTaskIfPossible(data: Parameters<typeof prisma.staffTask.create>[0]['data']) {
  try {
    await prisma.staffTask.create({ data })
  } catch {
    // Non-durable Vercel demo DB fallback.
  }
}

function isRecentlyAttempted(value: Date | string | null | undefined): boolean {
  if (!value) return false
  const attemptedAt = new Date(value).getTime()
  if (Number.isNaN(attemptedAt)) return false
  return Date.now() - attemptedAt < 90_000
}

async function runCall(jobId: string, fallbackJob?: RunnableCallJob | null, options: { force?: boolean } = {}) {
  const job = (await prisma.callJob.findUnique({ where: { id: jobId } }).catch(() => null)) ?? fallbackJob
  if (!job) throw new Error('Call job not found')
  if (job.validationStatus !== 'valid') throw new Error('Job failed validation')
  if (!options.force && job.twilioCallSid && ACTIVE_CALL_STATUSES.has(job.callStatus) && isRecentlyAttempted(job.callAttemptedAt)) {
    throw new Error('A call was just started for this job. Wait about 90 seconds, or use Retry to force a new call.')
  }

  await updateCallJobIfPresent(jobId, {
    callStatus: config.autoCallTestMode ? 'simulating' : 'dialing',
    callAttemptedAt: new Date(),
    errorMessage: null,
  })

  try {
    const result = config.autoCallTestMode
      ? { testMode: true as const, sid: `TEST_${job.id}_${Date.now()}` }
        : await startOutboundCall({
            to: job.phoneNumber,
            callJobId: job.id,
            callReason: job.callReason as CallReason,
            patientName: job.patientName,
            dob: job.dob,
            medicationName: job.medicationName,
          })

    const isTest = 'testMode' in result && result.testMode
    const sid = result.sid

    const testResponse =
      config.callMode === 'ai'
        ? 'Test mode — AI call simulated'
        : (getCallScript(job.callReason as CallReason).options[0]?.patientResponse ?? 'Test mode simulation')
    const aiSummary = isTest ? buildAiSummary(job.callReason as CallReason, testResponse) : null
    const updated = {
      ...job,
      callStatus: isTest ? 'completed' : 'queued_live',
      twilioCallSid: sid,
      callAttemptedAt: new Date(),
      callCompletedAt: isTest ? new Date() : null,
      callDuration: isTest ? 45 : null,
      patientResponse: isTest ? testResponse : null,
      aiSummary,
      errorMessage: null,
    }

    await updateCallJobIfPresent(jobId, {
      callStatus: updated.callStatus,
      twilioCallSid: sid,
      callAttemptedAt: updated.callAttemptedAt,
      callCompletedAt: updated.callCompletedAt,
      callDuration: updated.callDuration,
      patientResponse: updated.patientResponse,
      aiSummary,
      errorMessage: null,
    })

    await createCallEventIfPossible({
      callJobId: jobId,
      twilioCallSid: sid,
      eventType: isTest ? 'test_call_simulated' : 'call_initiated',
      eventPayload: JSON.stringify({ mode: isTest ? 'test' : 'live' }),
    })

    if (isTest) {
      const followUp = needsStaffFollowUp('', job.callReason)
      if (followUp.needed) {
        await createStaffTaskIfPossible({
          callJobId: jobId,
          patientName: job.patientName,
          phoneNumber: job.phoneNumber,
          medicationName: job.medicationName,
          taskType: 'follow_up',
          priority: 'high',
          notes: followUp.reason,
          aiSummary: updated.aiSummary,
        })
        await updateCallJobIfPresent(jobId, { staffFollowUpNeeded: true, followUpReason: followUp.reason })
      }
    }

    return updated
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Start call failed'
    await updateCallJobIfPresent(jobId, {
      callStatus: 'failed',
      callCompletedAt: new Date(),
      errorMessage: message,
      staffFollowUpNeeded: true,
      followUpReason: 'Call could not be started',
    })
    await createStaffTaskIfPossible({
      callJobId: jobId,
      patientName: job.patientName,
      phoneNumber: job.phoneNumber,
      medicationName: job.medicationName,
      taskType: 'failed_call',
      priority: 'high',
      notes: message,
    })
    throw e
  }
}

export async function startCallJobById(jobId: string) {
  return runCall(jobId)
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

callJobsRouter.post('/call-jobs/:id/retry', async (req, res) => {
  try {
    await prisma.callJob.update({
      where: { id: req.params.id },
      data: {
        callStatus: 'queued',
        twilioCallSid: null,
        callAttemptedAt: null,
        callCompletedAt: null,
        callDuration: null,
        errorMessage: null,
      },
    }).catch(() => null)
    const job = await runCall(
      req.params.id!,
      fallbackJobFromBody(req.params.id!, req.body as Record<string, unknown>),
      { force: true },
    )
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Retry failed' })
  }
})
