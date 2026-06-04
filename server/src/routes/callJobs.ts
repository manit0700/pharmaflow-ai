import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { buildExportWorkbook, validateCallInput } from '../services/excel.js'
import { buildAiSummary } from '../services/script.js'
import { needsStaffFollowUp } from '../services/safety.js'
import { startOutboundCall } from '../services/twilio.js'
import { config, type CallReason } from '../config.js'

export const callJobsRouter = Router()

callJobsRouter.get('/call-jobs', async (_req, res) => {
  const jobs = await prisma.callJob.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(jobs)
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

    const job = await prisma.callJob.create({
      data: {
        patientName: row.patientName,
        phoneNumber: row.phoneNumber,
        dob: row.dob,
        medicationName: row.medicationName,
        callReason: row.callReason,
        notes: row.notes,
        validationStatus: row.validationStatus,
        validationError: row.validationError,
        callStatus: row.validationStatus === 'valid' ? 'queued' : 'invalid',
      },
    })

    res.status(201).json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' })
  }
})

callJobsRouter.get('/call-jobs/export', async (_req, res) => {
  const jobs = await prisma.callJob.findMany({ orderBy: { createdAt: 'desc' } })
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

const ACTIVE_CALL_STATUSES = new Set(['dialing', 'queued_live', 'queued', 'ringing', 'in_progress'])

async function runCall(jobId: string) {
  const job = await prisma.callJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error('Call job not found')
  if (job.validationStatus !== 'valid') throw new Error('Job failed validation')
  if (job.twilioCallSid && ACTIVE_CALL_STATUSES.has(job.callStatus)) {
    throw new Error('A call is already queued or in progress for this job. Wait for the status callback or use Retry after it fails.')
  }

  await prisma.callJob.update({
    where: { id: jobId },
    data: {
      callStatus: config.autoCallTestMode ? 'simulating' : 'dialing',
      callAttemptedAt: new Date(),
      errorMessage: null,
    },
  })

  try {
    const result = config.autoCallTestMode
      ? { testMode: true as const, sid: `TEST_${job.id}_${Date.now()}` }
      : await startOutboundCall({
          to: job.phoneNumber,
          callJobId: job.id,
          callReason: job.callReason as CallReason,
        })

    const isTest = 'testMode' in result && result.testMode
    const sid = result.sid

    const updated = await prisma.callJob.update({
      where: { id: jobId },
      data: {
        callStatus: isTest ? 'completed' : 'queued',
        twilioCallSid: sid,
        callCompletedAt: isTest ? new Date() : null,
        callDuration: isTest ? 45 : null,
        patientResponse: isTest ? 'Confirmed refill (test mode)' : null,
        aiSummary: isTest ? buildAiSummary(job.callReason as CallReason, 'Test mode simulation') : null,
        errorMessage: null,
      },
    })

    await prisma.callEvent.create({
      data: {
        callJobId: jobId,
        twilioCallSid: sid,
        eventType: isTest ? 'test_call_simulated' : 'call_initiated',
        eventPayload: JSON.stringify({ mode: isTest ? 'test' : 'live' }),
      },
    })

    if (isTest) {
      const followUp = needsStaffFollowUp('', job.callReason)
      if (followUp.needed) {
        await prisma.staffTask.create({
          data: {
            callJobId: jobId,
            patientName: job.patientName,
            phoneNumber: job.phoneNumber,
            medicationName: job.medicationName,
            taskType: 'follow_up',
            priority: 'high',
            notes: followUp.reason,
            aiSummary: updated.aiSummary,
          },
        })
        await prisma.callJob.update({
          where: { id: jobId },
          data: { staffFollowUpNeeded: true, followUpReason: followUp.reason },
        })
      }
    }

    return updated
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Start call failed'
    await prisma.callJob.update({
      where: { id: jobId },
      data: {
        callStatus: 'failed',
        callCompletedAt: new Date(),
        errorMessage: message,
        staffFollowUpNeeded: true,
        followUpReason: 'Call could not be started',
      },
    })
    await prisma.staffTask.create({
      data: {
        callJobId: jobId,
        patientName: job.patientName,
        phoneNumber: job.phoneNumber,
        medicationName: job.medicationName,
        taskType: 'failed_call',
        priority: 'high',
        notes: message,
      },
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
    const job = await startCallJobById(callJobId)
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Start call failed' })
  }
})

callJobsRouter.post('/call-jobs/:id/start-call', async (req, res) => {
  try {
    const job = await runCall(req.params.id!)
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
    })
    const job = await runCall(req.params.id!)
    res.json(job)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Retry failed' })
  }
})
