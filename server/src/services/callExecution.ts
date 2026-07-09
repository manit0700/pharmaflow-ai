import { prisma } from '../lib/prisma.js'
import { config, type CallReason } from '../config.js'
import { getCallScript } from './callScripts.js'
import { buildAiSummary } from './script.js'
import { needsStaffFollowUp, normalizePhone } from './safety.js'
import { phoneProvider } from './phoneProvider.js'
import { assertCallerIdUsable } from './callerIdCheck.js'
import { isVapiConfigured, startVapiCall } from './vapi.js'

const ACTIVE_CALL_STATUSES = new Set(['dialing', 'queued_live', 'ringing', 'in_progress'])

export type RunnableCallJob = {
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
  doNotCall?: boolean | null
  prescriptionCost?: number | null
  prescriptionsJson?: string | null
}

function inBusinessHours(now = new Date()): boolean {
  const localHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  )
  return localHour >= config.businessHoursStart && localHour < config.businessHoursEnd
}

async function updateCallJobIfPresent(jobId: string, data: Parameters<typeof prisma.callJob.update>[0]['data']) {
  try {
    await prisma.callJob.update({ where: { id: jobId }, data })
  } catch {
    // Non-durable demo DB fallback.
  }
}

async function createCallEventIfPossible(data: Parameters<typeof prisma.callEvent.create>[0]['data']) {
  try {
    await prisma.callEvent.create({ data })
  } catch {
    // Non-critical audit event.
  }
}

async function createStaffTaskIfPossible(data: Parameters<typeof prisma.staffTask.create>[0]['data']) {
  try {
    await prisma.staffTask.create({ data })
  } catch {
    // Non-critical task fallback.
  }
}

function isRecentlyAttempted(value: Date | string | null | undefined): boolean {
  if (!value) return false
  const attemptedAt = new Date(value).getTime()
  if (Number.isNaN(attemptedAt)) return false
  return Date.now() - attemptedAt < 90_000
}

export async function runCall(jobId: string, fallbackJob?: RunnableCallJob | null, options: { force?: boolean } = {}) {
  const job = (await prisma.callJob.findUnique({ where: { id: jobId } }).catch(() => null)) ?? fallbackJob
  if (!job) throw new Error('Call job not found')
  if (job.validationStatus !== 'valid') throw new Error('Job failed validation')
  if (job.doNotCall) throw new Error('This number is on the do-not-call list.')
  const normalizedPhone = normalizePhone(job.phoneNumber) ?? job.phoneNumber
  const dnc = await prisma.doNotCallEntry.findUnique({ where: { phoneNumber: normalizedPhone } }).catch(() => null)
  if (dnc) throw new Error(`This number is on the do-not-call list: ${dnc.reason ?? 'listed number'}`)
  if (config.enforceBusinessHours && !inBusinessHours()) {
    throw new Error(`Outside pharmacy calling hours (${config.businessHoursStart}:00-${config.businessHoursEnd}:00 CT).`)
  }
  if (
    !options.force &&
    job.twilioCallSid &&
    ACTIVE_CALL_STATUSES.has(job.callStatus) &&
    isRecentlyAttempted(job.callAttemptedAt)
  ) {
    throw new Error('A call was just started for this job. Wait about 90 seconds, or use Retry to force a new call.')
  }

  // Validate caller ID before marking the job as dialing.
  // Skip in test mode — no real call is placed.
  if (!config.autoCallTestMode && !isVapiConfigured()) {
    await assertCallerIdUsable()
  }

  await updateCallJobIfPresent(jobId, {
    callStatus: config.autoCallTestMode ? 'simulating' : 'dialing',
    callAttemptedAt: new Date(),
    errorMessage: null,
    retryStatus: job.callStatus === 'scheduled' ? 'in_progress' : undefined,
    // Clear previous call's AI state so each attempt starts completely fresh.
    // Leaving __DOB_VERIFIED__ in messagesJson causes dobAlreadyVerified=true
    // at the start of the new call, which skips the DOB step entirely.
    messagesJson: null,
    patientResponse: null,
  })

  try {
    const result = config.autoCallTestMode
      ? { testMode: true as const, sid: `TEST_${job.id}_${Date.now()}` }
      : isVapiConfigured()
        ? await startVapiCall({
            to: job.phoneNumber,
            callJobId: job.id,
            patientName: job.patientName,
            metadata: {
              patientName: job.patientName,
              dob: job.dob,
              medicationName: job.medicationName,
              callReason: job.callReason,
            },
          }).then((call) => ({ sid: call.id, provider: 'vapi' as const }))
        : await phoneProvider.startOutboundCall({
          to: job.phoneNumber,
          callJobId: job.id,
          callReason: job.callReason as CallReason,
          patientName: job.patientName,
          dob: job.dob,
          medicationName: job.medicationName,
          prescriptionCost: job.prescriptionCost as number | null | undefined,
          prescriptionsJson: job.prescriptionsJson as string | null | undefined,
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
      vapiCallId: 'provider' in result && result.provider === 'vapi' ? sid : undefined,
      callAttemptedAt: updated.callAttemptedAt,
      callCompletedAt: updated.callCompletedAt,
      callDuration: updated.callDuration,
      patientResponse: updated.patientResponse,
      aiSummary,
      errorMessage: null,
      retryStatus: isTest ? 'completed' : 'in_progress',
    })

    await createCallEventIfPossible({
      callJobId: jobId,
      twilioCallSid: sid,
      eventType: isTest ? 'test_call_simulated' : 'call_initiated',
      eventPayload: JSON.stringify({ mode: isTest ? 'test' : 'live', provider: 'provider' in result ? result.provider : 'twilio' }),
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
      retryStatus: 'blocked',
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
  return runCall(jobId, null, { force: true })
}
