import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import { buildAiSummary } from '../services/script.js'
import { detectNonHumanAudio, isOptOutRequest, needsStaffFollowUp } from '../services/safety.js'
import { loadMessageHistory, runAiCallTurn } from '../services/callAi.js'
import { sendSmsFollowUp } from '../services/sms.js'
import {
  buildAiClosingTwiml,
  buildAiDobGatherTwiml,
  buildAiDobRetryTwiml,
  buildAiGatherTwiml,
  buildAiGreetingTwiml,
  buildAiPostDobPrompt,
  buildCallbackMatchTwiml,
  buildDtmfClosingTwiml,
  buildDtmfDobRetryTwiml,
  buildDtmfGreetingTwiml,
  buildDtmfMenuTwiml,
  buildInboundAckTwiml,
  buildInboundTwiml,
  buildTransferTwiml,
  buildVoicemailTwiml,
  resolveMenuSelection,
  scriptContextFromJob,
  verifyDob,
} from '../services/twilioFlow.js'
import { fillTemplate, getCallScript } from '../services/callScripts.js'
import { decodeCallbackState } from '../services/callbackState.js'
import {
  callbackEventKey,
  logCallbackDiagnostic,
  maskSid,
} from '../services/callbackUrls.js'
import {
  createAuditEvent,
  ensureFollowUpTaskForCallJob,
  ensureFollowUpTaskForCallOutcome,
  resolveOutcomeFromPatientAction,
} from '../services/followUpTasks.js'
import type { CallReason } from '../config.js'
import { canTransitionCallStatus } from '../services/callStatusTransitions.js'
import { scheduleOutcomeRetry } from '../services/voicemailRetry.js'

export const twilioRouter = Router()

function normalizeTwilioStatus(status?: string): string | undefined {
  if (!status) return undefined
  if (status === 'answered' || status === 'in-progress') return 'in_progress'
  if (status === 'no-answer') return 'no_answer'
  if (status === 'busy') return 'busy'
  if (status === 'canceled' || status === 'cancelled') return 'canceled'
  if (status === 'ringing') return 'ringing'
  if (status === 'initiated' || status === 'queued') return 'queued_live'
  return status
}

type TranscriptEntry = {
  at: string
  timestamp?: string
  sequence?: number
  speaker?: 'ai' | 'patient' | 'pharmacy_staff' | 'system'
  text?: string
  mode: 'dtmf' | 'ai' | 'system'
  step: string
  input?: string
  result?: string
  action?: string
  summary?: string
  eventKey?: string
}

function transcriptJsonWith(
  existing: string | null | undefined,
  entry: Omit<TranscriptEntry, 'at' | 'timestamp' | 'sequence'>,
): string {
  let entries: TranscriptEntry[] = []
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as unknown
      if (Array.isArray(parsed)) entries = parsed as TranscriptEntry[]
    } catch {
      entries = []
    }
  }
  if (entry.eventKey && entries.some((item) => item.eventKey === entry.eventKey)) {
    return JSON.stringify(entries.slice(-40))
  }

  const at = new Date().toISOString()
  const sequence =
    entries.reduce((max, item) => Math.max(max, typeof item.sequence === 'number' ? item.sequence : 0), 0) + 1
  const speaker =
    entry.speaker ??
    (entry.mode === 'ai'
      ? 'patient'
      : entry.mode === 'dtmf'
        ? 'patient'
        : 'system')
  const text = entry.text ?? entry.summary ?? entry.result ?? entry.input ?? entry.step
  entries.push({ at, timestamp: at, sequence, speaker, text, ...entry })
  return JSON.stringify(entries.slice(-40))
}

function transcriptHasEvent(existing: string | null | undefined, eventKey: string): boolean {
  if (!existing) return false
  try {
    const parsed = JSON.parse(existing) as unknown
    return Array.isArray(parsed) && parsed.some((entry) => entry && typeof entry === 'object' && (entry as TranscriptEntry).eventKey === eventKey)
  } catch {
    return false
  }
}

async function updateCallJobIfPossible(
  callJobId: string,
  data: Parameters<typeof prisma.callJob.update>[0]['data'],
): Promise<boolean> {
  try {
    await prisma.callJob.update({ where: { id: callJobId }, data })
    return true
  } catch {
    // Twilio still needs valid TwiML even when demo SQLite storage is unavailable.
    return false
  }
}

async function createCallEventOnce(params: {
  callJobId?: string | null
  twilioCallSid?: string | null
  eventType: string
  eventKey: string
  payload?: Record<string, unknown>
}) {
  const eventPayload = JSON.stringify({ eventKey: params.eventKey, ...(params.payload ?? {}) })
  try {
    const existing = await prisma.callEvent.findFirst({
      where: {
        callJobId: params.callJobId ?? undefined,
        twilioCallSid: params.twilioCallSid ?? undefined,
        eventType: params.eventType,
        eventPayload,
      },
    })
    if (existing) return
    await prisma.callEvent.create({
      data: {
        callJobId: params.callJobId,
        twilioCallSid: params.twilioCallSid,
        eventType: params.eventType,
        eventPayload,
      },
    })
  } catch {
    // Non-critical audit trail.
  }
}

function statusEventType(status: string | undefined): string {
  if (!status) return 'twilio_status'
  if (status === 'queued') return 'twilio_queued'
  if (status === 'initiated') return 'twilio_initiated'
  if (status === 'ringing') return 'twilio_ringing'
  if (status === 'answered' || status === 'in-progress') return 'call_in_progress'
  if (status === 'completed') return 'call_completed'
  if (status === 'failed') return 'call_failed'
  return `twilio_${status.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`
}

function isFinalTwilioStatus(status: string | undefined): boolean {
  return ['completed', 'busy', 'failed', 'no_answer', 'canceled', 'voicemail'].includes(status ?? '')
}

const MONTHS: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
}

const DAY_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  'twenty first': 21,
  'twenty-first': 21,
  'twenty second': 22,
  'twenty-second': 22,
  'twenty third': 23,
  'twenty-third': 23,
  'twenty fourth': 24,
  'twenty-fourth': 24,
  'twenty fifth': 25,
  'twenty-fifth': 25,
  'twenty sixth': 26,
  'twenty-sixth': 26,
  'twenty seventh': 27,
  'twenty-seventh': 27,
  'twenty eighth': 28,
  'twenty-eighth': 28,
  'twenty ninth': 29,
  'twenty-ninth': 29,
  thirtieth: 30,
  'thirty first': 31,
  'thirty-first': 31,
}

function digitsFromSpeech(input: string): string {
  const directDigits = input.replace(/\D/g, '')
  if (directDigits.length >= 4) return directDigits

  const normalized = input.toLowerCase().replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const [monthName, month] of Object.entries(MONTHS)) {
    const monthIndex = normalized.indexOf(monthName)
    if (monthIndex < 0) continue
    const afterMonth = normalized.slice(monthIndex + monthName.length).trim()
    const numericDay = afterMonth.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/)
    if (numericDay) return `${month}${numericDay[1]!.padStart(2, '0')}`
    for (const [word, day] of Object.entries(DAY_WORDS)) {
      if (afterMonth.includes(word)) return `${month}${String(day).padStart(2, '0')}`
    }
  }

  return normalized
    .split(/\s+/)
    .map((word) => NUMBER_WORDS[word] ?? '')
    .join('')
}

function isAffirmativeRefillAnswer(input: string): boolean {
  return /\b(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|process|refill|correct|right|sounds good)\b/i.test(input)
}

function isNegativeRefillAnswer(input: string): boolean {
  return /\b(no|nope|nah|not now|not today|later|skip|decline|do not|don't)\b/i.test(input)
}

async function createStaffTask(params: {
  callJobId?: string
  patientName: string
  phoneNumber: string
  medicationName?: string
  taskType: string
  priority: string
  notes: string
  aiSummary?: string
}) {
  try {
    await prisma.staffTask.create({ data: params })
  } catch {
    // Do not fail a live call because the demo task store is unavailable.
  }
}

twilioRouter.post('/twilio/status', async (req, res) => {
  const { CallSid, CallStatus, CallDuration, ErrorCode, ErrorMessage } = req.body as Record<string, string>
  const query = req.query as Record<string, string>
  const eventKey = callbackEventKey([CallSid, CallStatus, CallDuration, ErrorCode, query.callJobId])

  const job =
    (await prisma.callJob.findFirst({ where: { twilioCallSid: CallSid } }).catch(() => null)) ??
    (query.callJobId
      ? await prisma.callJob.findUnique({ where: { id: query.callJobId } }).catch(() => null)
      : null)
  let updated = false
  if (job) {
    await createCallEventOnce({
      callJobId: job.id,
      twilioCallSid: CallSid,
      eventType: statusEventType(CallStatus),
      eventKey,
      payload: {
        status: CallStatus,
        normalizedStatus: normalizeTwilioStatus(CallStatus),
        duration: CallDuration ? Number(CallDuration) : null,
        errorCode: ErrorCode ?? null,
        errorMessage: ErrorMessage ?? null,
      },
    })

    const normalizedStatus = normalizeTwilioStatus(CallStatus)
    const final = isFinalTwilioStatus(normalizedStatus)

    // Guard: block late/conflicting Twilio status callbacks from overwriting final states
    if (normalizedStatus) {
      const transition = canTransitionCallStatus(job.callStatus, normalizedStatus, 'twilio_callback')
      if (!transition.allowed) {
        await createCallEventOnce({
          callJobId: job.id,
          twilioCallSid: CallSid,
          eventType: 'status_transition_blocked',
          eventKey: callbackEventKey([CallSid, job.callStatus, normalizedStatus, 'blocked']),
          payload: { currentStatus: job.callStatus, requestedStatus: normalizedStatus, source: 'twilio_callback', reason: transition.reason },
        })
        res.status(204).send()
        return
      }
    }

    const nextStatus = normalizedStatus ?? job.callStatus
    const followUpNeeded =
      ['failed', 'no_answer', 'busy', 'canceled', 'voicemail'].includes(normalizedStatus ?? '') || job.staffFollowUpNeeded
    const followUpReason =
      ['failed', 'no_answer', 'busy', 'canceled', 'voicemail'].includes(normalizedStatus ?? '')
        ? `Call ended with status ${normalizedStatus}`
        : job.followUpReason

    updated = await updateCallJobIfPossible(job.id, {
      callStatus: nextStatus,
      callCompletedAt: final ? new Date() : job.callCompletedAt,
      callDuration: CallDuration ? Number(CallDuration) : job.callDuration,
      // Clear in_progress retryStatus when the call reaches a terminal state
      ...(final && job.retryStatus === 'in_progress' ? { retryStatus: 'none' } : {}),
      errorMessage: ErrorCode ? `${ErrorCode}: ${ErrorMessage ?? 'Twilio call error'}` : job.errorMessage,
      aiSummary:
        final && !job.aiSummary
          ? `Outbound call ended with Twilio status ${normalizedStatus ?? CallStatus}.`
          : job.aiSummary,
      staffFollowUpNeeded: followUpNeeded,
      followUpReason,
      resolutionStatus: final
        ? followUpNeeded
          ? 'pending'
          : nextStatus === 'completed'
            ? 'resolved'
            : nextStatus
        : job.resolutionStatus,
    })

    if (final) {
      if ((normalizedStatus === 'no_answer' || normalizedStatus === 'busy') && job.retryStatus !== 'scheduled' && job.retryAttempt < 3) {
        await scheduleOutcomeRetry(job.id, normalizedStatus).catch(() => null)
      }
      const updatedJob = await prisma.callJob.findUnique({ where: { id: job.id } }).catch(() => null)
      if (updatedJob?.staffFollowUpNeeded) {
        await ensureFollowUpTaskForCallJob(updatedJob.id).catch(() => null)
      }
      await createAuditEvent('call_job', job.id, 'TWILIO_FINAL_STATUS', 'Twilio final status received.', {
        status: normalizedStatus ?? CallStatus,
        twilioCallSid: maskSid(CallSid),
      }).catch(() => null)
    }
  }

  logCallbackDiagnostic({
    route: '/api/twilio/status',
    callJobId: job?.id ?? query.callJobId,
    twilioCallSid: CallSid,
    twilioStatus: CallStatus,
    foundJob: Boolean(job),
    updated,
  })

  res.sendStatus(204)
})

async function handleInbound(req: import('express').Request, res: import('express').Response) {
  const body = (req.body ?? {}) as Record<string, string>
  const caller = body.From ?? 'unknown'

  // Look for a recent outbound call we left a voicemail or missed — match by phone number
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const matchedJob = await prisma.callJob.findFirst({
    where: {
      phoneNumber: caller,
      callStatus: { in: ['voicemail', 'no_answer', 'callback_requested'] },
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null)

  await prisma.inboundCall.create({
    data: {
      callerPhone: caller,
      status: 'active',
      intent: matchedJob ? 'callback_return' : 'unknown',
      summary: matchedJob ? `Callback for outbound job ${matchedJob.id} (${matchedJob.callReason})` : undefined,
    },
  }).catch(() => null)

  if (matchedJob) {
    const ctx = scriptContextFromJob(matchedJob)
    res.type('text/xml').send(buildCallbackMatchTwiml({
      callJobId: matchedJob.id,
      reason: matchedJob.callReason as import('../config.js').CallReason,
      ctx,
    }))
    return
  }

  res.type('text/xml').send(buildInboundTwiml())
}

twilioRouter.get('/twilio/inbound', handleInbound)
twilioRouter.post('/twilio/inbound', handleInbound)

async function handleVoiceResponse(req: import('express').Request, res: import('express').Response) {
  const query = req.query as Record<string, string>
  const body = (req.body ?? {}) as Record<string, string>
  const digits = body.Digits ?? ''
  // Accept speech at 0.45+ confidence. Background voices in the same room typically
  // score 0.25–0.44; the patient speaking directly into the phone scores 0.45+.
  const rawConf = body.Confidence !== undefined ? parseFloat(String(body.Confidence)) : 1.0
  const speechConf = Number.isNaN(rawConf) ? 1.0 : rawConf
  const speech = speechConf >= 0.45 ? (body.SpeechResult ?? '') : ''
  if (!body.SpeechResult && !body.Digits) {
    console.log('[gather-debug] no speech/digits received', {
      step: query.step, conf: body.Confidence, speechResult: body.SpeechResult, digits: body.Digits,
    })
  }
  const state = query.state
  const decodedState = decodeCallbackState(state)
  const callJobId = query.callJobId ?? decodedState?.id
  const step = query.step ?? 'greeting'
  const reason = (query.reason ?? decodedState?.callReason ?? 'general_callback') as CallReason
  const mode = query.mode ?? config.callMode
  const flow = query.flow

  if (flow === 'inbound') {
    const intentMap: Record<string, string> = config.staffPhone
      ? { '1': 'staff' }
      : { '1': 'refill', '2': 'status', '3': 'delivery', '4': 'store_hours', '0': 'staff' }
    const intent = intentMap[digits] ?? 'unknown'
    const caller = body.From ?? 'unknown'

    const inbound = await prisma.inboundCall.create({
      data: {
        callerPhone: caller,
        intent,
        status: intent === 'staff' ? 'escalated' : 'resolved',
        handoffReason: intent === 'staff' ? 'Caller requested staff' : null,
        summary: `Inbound IVR selection: ${intent}`,
      },
    }).catch(() => null)

    if (intent === 'staff') {
      if (inbound?.id) {
        await createStaffTask({
          patientName: 'Inbound caller',
          phoneNumber: caller,
          taskType: 'inbound_handoff',
          priority: 'urgent',
          notes: 'Inbound caller pressed 0 for staff',
          aiSummary: inbound.summary ?? undefined,
        })
      }
      res.type('text/xml').send(buildTransferTwiml())
      return
    }

    res.type('text/xml').send(buildInboundAckTwiml())
    return
  }

  // Callback return — patient pressed 1 or 2 after our callback-match greeting
  if (flow === 'callback_return' && callJobId) {
    const caller = body.From ?? 'unknown'
    const matchedJob = await prisma.callJob.findUnique({ where: { id: callJobId } }).catch(() => null)

    if (digits === '1' || !digits) {
      // Patient wants to speak with staff — update original job + create task
      await prisma.callJob.update({
        where: { id: callJobId },
        data: {
          staffFollowUpNeeded: true,
          followUpReason: 'Patient called back — ready to speak with staff',
          patientResponse: matchedJob?.patientResponse
            ? `${matchedJob.patientResponse}; Patient called back`
            : 'Patient called back',
        },
      }).catch(() => null)

      await prisma.inboundCall.create({
        data: {
          callerPhone: caller,
          intent: 'callback_return_staff',
          status: 'escalated',
          summary: `Patient called back for job ${callJobId} — transferred to staff`,
        },
      }).catch(() => null)

      await createStaffTask({
        callJobId,
        patientName: matchedJob?.patientName ?? 'Unknown',
        phoneNumber: caller,
        medicationName: matchedJob?.medicationName ?? undefined,
        taskType: 'callback_return',
        priority: 'urgent',
        notes: `Patient called back regarding ${matchedJob?.callReason ?? 'prescription matter'}. Original call status was ${matchedJob?.callStatus ?? 'unknown'}.`,
      })

      res.type('text/xml').send(buildTransferTwiml())
      return
    }

    if (digits === '2') {
      // Patient wants to leave a message — play voicemail ack
      await prisma.inboundCall.create({
        data: {
          callerPhone: caller,
          intent: 'callback_return_voicemail',
          status: 'resolved',
          summary: `Patient called back for job ${callJobId} — left message request`,
        },
      }).catch(() => null)
      res.type('text/xml').send(buildInboundAckTwiml())
      return
    }

    // No digit pressed — transfer to staff as default
    res.type('text/xml').send(buildTransferTwiml())
    return
  }

  if (!callJobId) {
    res.type('text/xml').send(buildVoicemailTwiml(reason, { pharmacyName: config.pharmacyName, patientName: '', medicationName: '' }))
    return
  }

  const job =
    (await prisma.callJob.findUnique({ where: { id: callJobId } }).catch(() => null)) ??
    (decodedState
      ? {
          id: decodedState.id,
          patientName: decodedState.patientName,
          phoneNumber: decodedState.phoneNumber,
          dob: decodedState.dob,
          medicationName: decodedState.medicationName,
          callReason: decodedState.callReason,
          prescriptionCost: decodedState.prescriptionCost ?? null,
          prescriptionsJson: decodedState.prescriptionsJson ?? null,
          notes: null,
          validationStatus: 'valid',
          validationError: null,
          callStatus: 'in_progress',
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
        }
      : null)
  if (!job) {
    res.type('text/xml').send(buildVoicemailTwiml(reason, { pharmacyName: config.pharmacyName, patientName: '', medicationName: '' }))
    return
  }

  const ctx = scriptContextFromJob(job)

  // AMD: machineDetection='Enable' is set in calls.create(), so AnsweredBy is always present.
  // Only treat as voicemail when Twilio explicitly signals a machine answer — never infer from absence.
  const machineAnsweredBy = new Set(['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax'])
  if (body.AnsweredBy && machineAnsweredBy.has(body.AnsweredBy)) {
    await updateCallJobIfPossible(callJobId, {
      callStatus: 'voicemail',
      patientResponse: 'Voicemail',
      staffFollowUpNeeded: true,
      followUpReason: 'Call went to voicemail — no live patient answer',
    })
    await scheduleOutcomeRetry(callJobId, 'voicemail').catch(() => null)
    res.type('text/xml').send(buildVoicemailTwiml(reason, ctx))
    return
  }

  // Treat all non-machine cases as live human: AnsweredBy absent (AMD off), 'human', or any unknown value.
  // Never infer voicemail from an absent or unrecognised AnsweredBy.
  if (!body.AnsweredBy || !machineAnsweredBy.has(body.AnsweredBy)) {
    const transition = canTransitionCallStatus(job.callStatus, 'in_progress', 'twilio_callback')
    if (!transition.allowed) {
      await createCallEventOnce({
        callJobId,
        twilioCallSid: body.CallSid,
        eventType: 'status_transition_blocked',
        eventKey: callbackEventKey([body.CallSid, job.callStatus, 'in_progress', 'voice_response_blocked']),
        payload: {
          currentStatus: job.callStatus,
          requestedStatus: 'in_progress',
          source: 'twilio_callback',
          reason: transition.reason,
        },
      })
      logCallbackDiagnostic({
        route: '/api/twilio/voice-response',
        callJobId,
        twilioCallSid: body.CallSid,
        twilioStatus: 'blocked_stale_voice_response',
        foundJob: true,
        updated: false,
      })
      res.type('text/xml').send('<Response><Hangup/></Response>')
      return
    }
    await updateCallJobIfPossible(callJobId, {
      callStatus: 'in_progress',
    })
  }

  if (mode === 'ai') {
    await handleAiVoiceResponse(res, { callJobId, step, reason, ctx, job, speech, digits, state, twilioCallSid: body.CallSid })
    return
  }

  await handleDtmfVoiceResponse(res, { callJobId, step, reason, ctx, job, digits, state })
}

async function handleDtmfVoiceResponse(
  res: import('express').Response,
  params: {
    callJobId: string
    step: string
    reason: CallReason
    ctx: ReturnType<typeof scriptContextFromJob>
    job: {
      id: string
      dob: string
      patientName: string
      phoneNumber: string
      medicationName: string
      patientResponse: string | null
      transcriptJson: string | null
    }
    digits: string
    state?: string
  },
) {
  const { callJobId, step, reason, ctx, job, digits, state } = params
  const script = getCallScript(reason)

  if (step === 'dob') {
    const dobInputLabel = 'DOB entered'
    if (verifyDob(digits, job.dob)) {
      await updateCallJobIfPossible(callJobId, {
        patientResponse: 'DOB verified',
        callStatus: 'in_progress',
        transcriptJson: transcriptJsonWith(job.transcriptJson, {
          mode: 'dtmf',
          step: 'dob',
          input: dobInputLabel,
          result: 'DOB verified',
        }),
      })
      res.type('text/xml').send(buildDtmfMenuTwiml({ callJobId, reason, ctx, state }))
      return
    }

    if (job.patientResponse === 'DOB retry') {
      await updateCallJobIfPossible(callJobId, {
        patientResponse: 'DOB verification failed',
        staffFollowUpNeeded: true,
        followUpReason: 'Patient could not verify date of birth on call',
        callStatus: 'escalated',
        callCompletedAt: new Date(),
        resolutionStatus: 'escalated',
          transcriptJson: transcriptJsonWith(job.transcriptJson, {
            mode: 'dtmf',
            step: 'dob',
            input: dobInputLabel,
            result: 'DOB verification failed',
            action: 'callback',
          }),
      })
      await createStaffTask({
        callJobId,
        patientName: job.patientName,
        phoneNumber: job.phoneNumber,
        medicationName: job.medicationName,
        taskType: 'dob_failed',
        priority: 'high',
        notes: 'DOB verification failed during outbound call',
      })
      res.type('text/xml').send(buildVoicemailTwiml(reason, ctx))
      return
    }

    await updateCallJobIfPossible(callJobId, {
      patientResponse: 'DOB retry',
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        mode: 'dtmf',
        step: 'dob',
        input: dobInputLabel,
        result: 'DOB retry',
      }),
    })
    res.type('text/xml').send(buildDtmfDobRetryTwiml({ callJobId, reason, state }))
    return
  }

  if (step === 'menu' && digits.length >= 1) {
    const option = resolveMenuSelection(reason, digits.charAt(0))
    if (!option) {
      res.type('text/xml').send(buildDtmfMenuTwiml({ callJobId, reason, ctx, state }))
      return
    }

    const aiSummary = buildAiSummary(reason, option.patientResponse)
    const needsStaff = option.action === 'transfer' || option.action === 'callback'
    const callStatus =
      option.action === 'transfer' ? 'escalated' : option.action === 'callback' ? 'callback_requested' : 'completed'

    await updateCallJobIfPossible(callJobId, {
      patientResponse: option.patientResponse,
      aiSummary,
      staffFollowUpNeeded: needsStaff,
      followUpReason: needsStaff ? option.patientResponse : null,
      callStatus,
      callCompletedAt: option.action === 'transfer' ? null : new Date(),
      resolutionStatus: option.action === 'complete' ? 'resolved' : option.action,
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        mode: 'dtmf',
        speaker: 'patient',
        step: 'menu',
        input: digits.charAt(0),
        result: option.patientResponse,
        action: option.action,
        text: option.patientResponse,
        summary: aiSummary,
      }),
    })

    if (needsStaff) {
      await ensureFollowUpTaskForCallOutcome(
        {
          id: callJobId,
          patientName: job.patientName,
          phoneNumber: job.phoneNumber,
          medicationName: job.medicationName,
          callReason: reason,
          callStatus,
          patientResponse: option.patientResponse,
          followUpReason: option.patientResponse,
          staffFollowUpNeeded: true,
          aiSummary,
        },
        option.action === 'callback' ? 'callback_requested' : 'pharmacist_review',
      ).catch(() => null)
    }

    res
      .type('text/xml')
      .send(
        buildDtmfClosingTwiml({
          reason,
          closingMessage: script.closing(option),
          action: option.action,
        }),
      )
    return
  }

  res.type('text/xml').send(buildDtmfGreetingTwiml({ callJobId, reason, ctx, state }))
}

async function handleAiVoiceResponse(
  res: import('express').Response,
  params: {
    callJobId: string
    step: string
    reason: CallReason
    ctx: ReturnType<typeof scriptContextFromJob>
    job: {
      id: string
      dob?: string
      patientName: string
      phoneNumber: string
      medicationName: string
      prescriptionsJson?: string | null
      callStatus?: string | null
      patientResponse?: string | null
      messagesJson: string | null
      transcriptJson: string | null
    }
    speech: string
    digits?: string
    state?: string
    twilioCallSid?: string
  },
) {
  const { callJobId, step, reason, ctx, job, speech, digits, state, twilioCallSid } = params

  // Ignore stale Twilio webhooks that arrive after the call is already resolved
  const terminalStatuses = new Set(['escalated', 'completed', 'callback_requested', 'voicemail', 'failed', 'needs_review'])
  if (job.callStatus && terminalStatuses.has(job.callStatus)) {
    res.type('text/xml').send('<Response><Hangup/></Response>')
    return
  }

  // Hybrid mode: in AI calls, also accept keypad input.
  if (digits && /^\d+$/.test(digits)) {
    if (step === 'ai_greeting' || step === 'greeting') {
      if (digits.length < 4) {
        // During AI greeting, keypad input is reserved for DOB verification.
        // Do not treat partial digits as menu actions to avoid accidental transfer.
        res.type('text/xml').send(buildAiGreetingTwiml({ callJobId, reason, ctx, state }))
        return
      }
    }
  }

  if (step === 'ai_greeting' || (step === 'greeting' && !speech && !digits)) {
    const greetingEventKey = callbackEventKey([twilioCallSid, callJobId, 'ai_greeting'])

    // Twilio may retry the initial voice-response webhook on slow responses.
    // If the greeting was already stored, serve a brief availability re-prompt instead of
    // replaying the full intro — prevents the patient from hearing the intro twice.
    if (transcriptHasEvent(job.transcriptJson, greetingEventKey)) {
      res.type('text/xml').send(buildAiGatherTwiml({
        callJobId,
        reason,
        spoken: 'Are you available to speak for a moment?',
        step: 'availability',
        state,
      }))
      return
    }

    const script = getCallScript(reason)
    const availabilitySpoken = `${fillTemplate(script.greeting, ctx)} Are you available to speak for a moment?`
    await updateCallJobIfPossible(callJobId, {
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        eventKey: greetingEventKey,
        mode: 'ai',
        speaker: 'ai',
        step: 'availability',
        text: availabilitySpoken,
      }),
    })
    res.type('text/xml').send(buildAiGreetingTwiml({ callJobId, reason, ctx, state }))
    return
  }

  const userText = speech.trim() || (digits ?? '').trim() || '(no speech detected)'

  const history = loadMessageHistory(job.messagesJson)

  // Count completed AI turns (1 assistant message = 1 turn)
  const aiTurns = history.filter((m) => m.role === 'assistant').length
  // Check if DOB has been verified in a prior turn.
  // Fall back to job.patientResponse in case the messagesJson update was not persisted
  // (e.g. race condition between updateCallJobIfPossible and the next webhook).
  const dobAlreadyVerified =
    history.some((m) => m.role === 'system' && m.content === '__DOB_VERIFIED__') ||
    job.patientResponse === 'DOB verified'

  // IVR/voicemail detection: only check when speech is present and call is early (< 3 AI turns).
  // Catches IVR greetings transcribed as patient speech before wasting an OpenAI call.
  if (speech && aiTurns < 3 && detectNonHumanAudio(speech)) {
    const ivrEventKey = callbackEventKey([twilioCallSid, callJobId, 'non_human_audio', speech.slice(0, 40)])
    if (!transcriptHasEvent(job.transcriptJson, ivrEventKey)) {
      await updateCallJobIfPossible(callJobId, {
        callStatus: 'voicemail',
        patientResponse: 'Voicemail or IVR detected',
        aiSummary: 'Call reached voicemail or automated phone system.',
        staffFollowUpNeeded: true,
        followUpReason: 'Voicemail or automated system detected',
        callCompletedAt: new Date(),
        resolutionStatus: 'pending',
        transcriptJson: transcriptJsonWith(job.transcriptJson, {
          eventKey: ivrEventKey,
          mode: 'system' as const,
          speaker: 'system',
          step: 'ivr_detection',
          text: 'Voicemail or IVR detected',
          result: 'voicemail',
        }),
      })
      await createCallEventOnce({
        callJobId,
        twilioCallSid,
        eventType: 'non_human_audio_detected',
        eventKey: ivrEventKey,
        payload: { step, speechLength: speech.length },
      })
      await scheduleOutcomeRetry(callJobId, 'voicemail').catch(() => null)
      await ensureFollowUpTaskForCallOutcome(
        {
          id: callJobId,
          patientName: job.patientName,
          phoneNumber: job.phoneNumber,
          medicationName: job.medicationName,
          callReason: reason,
          callStatus: 'voicemail',
          patientResponse: 'Voicemail or IVR detected',
          followUpReason: 'Voicemail or automated system detected',
          staffFollowUpNeeded: true,
          aiSummary: 'Call reached voicemail or automated phone system.',
        },
        'voicemail',
      ).catch(() => null)
    }
    res.type('text/xml').send(buildVoicemailTwiml(reason, ctx))
    return
  }

  // Opt-out: patient asked to stop calls — mark do-not-call and end politely
  if (speech && isOptOutRequest(speech)) {
    const optOutEventKey = callbackEventKey([twilioCallSid, callJobId, 'opt_out', speech.slice(0, 40)])
    if (!transcriptHasEvent(job.transcriptJson, optOutEventKey)) {
      await updateCallJobIfPossible(callJobId, {
        callStatus: 'completed',
        patientResponse: 'Patient requested no further calls',
        staffFollowUpNeeded: true,
        followUpReason: 'Patient asked to stop calls — staff to review',
        callCompletedAt: new Date(),
        resolutionStatus: 'complete',
        transcriptJson: transcriptJsonWith(job.transcriptJson, {
          eventKey: optOutEventKey,
          mode: 'system',
          speaker: 'patient',
          step: 'opt_out',
          text: speech,
          result: 'opt_out_requested',
        }),
      })
    }
    res.type('text/xml').send(buildAiClosingTwiml(
      'We have removed you from our call list. We apologize for any inconvenience. Have a great day.',
      'complete',
    ))
    return
  }

  // Availability check — patient said yes/no to "are you available?"
  if (step === 'availability') {
    const availabilityEventKey = callbackEventKey([twilioCallSid, callJobId, 'availability', speech.slice(0, 40)])

    const notAvailablePatterns =
      /\b(no|nope|nah|not now|not available|busy|bad time|call back|call me later|can't talk|cannot talk|not a good time|bad moment)\b/i
    const availablePatterns =
      /\b(yes|yeah|yep|sure|ok|okay|go ahead|available|now is fine|that's fine|of course|absolutely|please|go for it)\b/i

    const isNo = notAvailablePatterns.test(speech) || digits === '2'
    const isYes = !isNo && (availablePatterns.test(speech) || digits === '1')

    if (isNo) {
      await updateCallJobIfPossible(callJobId, {
        callStatus: 'callback_requested',
        patientResponse: 'Not available — requested callback',
        staffFollowUpNeeded: true,
        followUpReason: 'Patient was not available when called',
        callCompletedAt: new Date(),
        resolutionStatus: 'callback',
        transcriptJson: transcriptJsonWith(job.transcriptJson, {
          eventKey: availabilityEventKey,
          mode: 'ai',
          speaker: 'patient',
          step: 'availability',
          text: speech || digits || 'not available',
          result: 'callback_requested',
        }),
      })
      await ensureFollowUpTaskForCallOutcome(
        {
          id: callJobId,
          patientName: job.patientName,
          phoneNumber: job.phoneNumber,
          medicationName: job.medicationName,
          callReason: reason,
          callStatus: 'callback_requested',
          patientResponse: 'Not available — requested callback',
          followUpReason: 'Patient was not available when called',
          staffFollowUpNeeded: true,
        },
        'callback_requested',
      ).catch(() => null)
      res.type('text/xml').send(buildAiClosingTwiml(
        'No problem at all. We will try you again at a better time. Have a great day.',
        'complete',
      ))
      return
    }

    if (isYes) {
      await updateCallJobIfPossible(callJobId, {
        transcriptJson: transcriptJsonWith(job.transcriptJson, {
          eventKey: availabilityEventKey,
          mode: 'ai',
          speaker: 'patient',
          step: 'availability',
          text: speech || digits || 'yes',
          result: 'available',
        }),
      })
      res.type('text/xml').send(buildAiDobGatherTwiml({ callJobId, reason, state }))
      return
    }

    // Unclear or no speech — re-ask at most once. If already re-asked, treat as
    // not available to prevent looping on background noise.
    const availabilityReaskKey = callbackEventKey([twilioCallSid, callJobId, 'availability_reask'])
    const alreadyReasked = transcriptHasEvent(job.transcriptJson, availabilityReaskKey)

    if (alreadyReasked) {
      await updateCallJobIfPossible(callJobId, {
        callStatus: 'callback_requested',
        patientResponse: 'Could not confirm availability',
        staffFollowUpNeeded: true,
        followUpReason: 'Unable to confirm patient availability — background noise or no response',
        callCompletedAt: new Date(),
        resolutionStatus: 'pending',
      })
      res.type('text/xml').send(buildAiClosingTwiml(
        'We had trouble hearing you. We will try reaching you again at another time. Have a great day.',
        'complete',
      ))
      return
    }

    await updateCallJobIfPossible(callJobId, {
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        eventKey: availabilityReaskKey,
        mode: 'system',
        speaker: 'system',
        step: 'availability_reask',
        text: 'Re-asked availability due to unclear response',
      }),
    })
    res.type('text/xml').send(buildAiGatherTwiml({
      callJobId,
      reason,
      spoken: 'Sorry, I did not catch that. Are you available to speak for a moment? Please say yes or no, or press 1 for yes or 2 for no.',
      step: 'availability',
      state,
    }))
    return
  }

  if ((step === 'ai_greeting' || step === 'greeting') && !dobAlreadyVerified) {
    const dobInput = digits?.trim() || digitsFromSpeech(speech)
    const dobEventKey = callbackEventKey([twilioCallSid, callJobId, 'ai_dob', dobInput || userText])
    if (dobInput && verifyDob(dobInput, job.dob ?? '')) {
      const withPatientTurn = transcriptJsonWith(job.transcriptJson, {
        eventKey: dobEventKey,
        mode: 'ai',
        speaker: 'patient',
        step: 'dob',
        text: 'DOB provided',
        input: 'DOB provided',
        result: 'DOB verified',
      })
      await updateCallJobIfPossible(callJobId, {
        patientResponse: 'DOB verified',
        callStatus: 'in_progress',
        messagesJson: JSON.stringify([...history, { role: 'system' as const, content: '__DOB_VERIFIED__' }]),
        transcriptJson: withPatientTurn,
      })
      res.type('text/xml').send(buildAiPostDobPrompt({ callJobId, reason, ctx, state }))
      return
    }

    await updateCallJobIfPossible(callJobId, {
      patientResponse: job.patientResponse === 'DOB retry' ? 'DOB verification failed' : 'DOB retry',
      staffFollowUpNeeded: job.patientResponse === 'DOB retry',
      followUpReason: job.patientResponse === 'DOB retry' ? 'Unable to verify date of birth by speech or keypad' : null,
      callStatus: job.patientResponse === 'DOB retry' ? 'escalated' : 'in_progress',
      resolutionStatus: job.patientResponse === 'DOB retry' ? 'escalated' : null,
      callCompletedAt: job.patientResponse === 'DOB retry' ? new Date() : null,
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        eventKey: dobEventKey,
        mode: 'ai',
        speaker: 'patient',
        step: 'dob',
        text: userText,
        input: userText,
        result: job.patientResponse === 'DOB retry' ? 'DOB verification failed' : 'DOB retry',
      }),
    })
    res.type('text/xml').send(
      job.patientResponse === 'DOB retry'
        ? buildAiClosingTwiml('We were unable to verify your identity. A pharmacy team member will follow up with you shortly.', 'callback')
        : buildAiDobRetryTwiml({ callJobId, reason, state }),
    )
    return
  }

  if (dobAlreadyVerified && reason === 'refill_reminder') {
    if (!speech.trim() && !(digits ?? '').trim()) {
      res.type('text/xml').send(buildAiGatherTwiml({
        callJobId,
        reason,
        spoken: 'Sorry, I did not catch your answer. Would you like us to process that refill today?',
        step: 'ai',
        state,
      }))
      return
    }

    const normalizedInput = digits === '1' ? 'yes' : digits === '2' ? 'no' : userText
    if (isAffirmativeRefillAnswer(normalizedInput) || isNegativeRefillAnswer(normalizedInput)) {
      const confirmed = isAffirmativeRefillAnswer(normalizedInput)
      const patientResponse = confirmed ? 'Confirmed refill — process today' : 'Declined refill'
      const aiSummary = confirmed
        ? `Patient confirmed refill for ${ctx.medicationName}.`
        : `Patient declined refill for ${ctx.medicationName}.`
      const withPatientTurn = transcriptJsonWith(job.transcriptJson, {
        eventKey: callbackEventKey([twilioCallSid, callJobId, 'refill_answer', normalizedInput]),
        mode: 'ai',
        speaker: 'patient',
        step: 'speech_turn',
        text: normalizedInput,
        input: normalizedInput,
        result: patientResponse,
        action: 'complete',
      })
      await updateCallJobIfPossible(callJobId, {
        patientResponse,
        aiSummary,
        staffFollowUpNeeded: false,
        followUpReason: null,
        callStatus: 'completed',
        callCompletedAt: new Date(),
        resolutionStatus: 'resolved',
        transcriptJson: transcriptJsonWith(withPatientTurn, {
          eventKey: callbackEventKey([twilioCallSid, callJobId, 'refill_answer_ai', normalizedInput]),
          mode: 'ai',
          speaker: 'ai',
          step: 'speech_turn',
          text: 'Thank you. We have recorded your answer.',
          result: patientResponse,
          action: 'complete',
          summary: aiSummary,
        }),
      })
      res.type('text/xml').send(buildAiClosingTwiml('Thank you. We have recorded your answer.', 'complete'))
      return
    }
  }

  // Hard turn limit: max 8 AI exchanges before escalating
  if (aiTurns >= 8) {
    await updateCallJobIfPossible(callJobId, {
      staffFollowUpNeeded: true,
      followUpReason: 'Call exceeded maximum turns without resolution',
      callStatus: 'escalated',
      resolutionStatus: 'escalated',
      callCompletedAt: new Date(),
    })
    res.type('text/xml').send(buildAiClosingTwiml(
      'Thank you for your patience. A pharmacy team member will follow up with you shortly.',
      'callback',
    ))
    return
  }

  // DOB gate: 3 turns without DOB verified → escalate
  if (!dobAlreadyVerified && aiTurns >= 3) {
    await updateCallJobIfPossible(callJobId, {
      patientResponse: 'DOB verification failed',
      staffFollowUpNeeded: true,
      followUpReason: 'Unable to verify identity after 3 attempts',
      callStatus: 'escalated',
      resolutionStatus: 'escalated',
      callCompletedAt: new Date(),
    })
    res.type('text/xml').send(buildAiClosingTwiml(
      'We were unable to verify your identity. A pharmacy team member will follow up with you shortly.',
      'callback',
    ))
    return
  }

  // If no speech and no digits at this point, re-prompt briefly rather than
  // sending "(no speech detected)" to OpenAI, which wastes a turn and can confuse the AI.
  if (!speech.trim() && !(digits ?? '').trim()) {
    const noSpeechRepromptKey = callbackEventKey([twilioCallSid, callJobId, 'no_speech_reprompt'])
    const alreadyReprompted = transcriptHasEvent(job.transcriptJson, noSpeechRepromptKey)

    // If we already re-prompted once with no response, patient is not responding —
    // mark callback_requested so staff can follow up rather than looping.
    if (alreadyReprompted && dobAlreadyVerified) {
      await updateCallJobIfPossible(callJobId, {
        callStatus: 'callback_requested',
        patientResponse: job.patientResponse ?? 'No response after prescription question',
        staffFollowUpNeeded: true,
        followUpReason: 'Patient did not respond to prescription question — staff to follow up',
        callCompletedAt: new Date(),
        resolutionStatus: 'pending',
      })
      res.type('text/xml').send(buildAiClosingTwiml(
        'We did not hear a response. A pharmacy team member will follow up with you shortly.',
        'callback',
      ))
      return
    }

    const reprompt = dobAlreadyVerified
      ? 'I did not catch that. Could you say that again?'
      : 'I did not hear you clearly. Please say your date of birth.'

    // Record this reprompt so the next no-speech knows to give up
    await updateCallJobIfPossible(callJobId, {
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        eventKey: noSpeechRepromptKey,
        mode: 'ai',
        speaker: 'ai',
        step: 'no_speech_reprompt',
        text: reprompt,
      }),
    })

    res.type('text/xml').send(buildAiGatherTwiml({
      callJobId,
      reason,
      spoken: reprompt,
      step: dobAlreadyVerified ? 'ai' : 'greeting',
      state,
    }))
    return
  }

  const eventKey = callbackEventKey([twilioCallSid, callJobId, step, userText])

  if (transcriptHasEvent(job.transcriptJson, eventKey)) {
    logCallbackDiagnostic({
      route: '/api/twilio/voice-response',
      callJobId,
      twilioCallSid,
      twilioStatus: 'duplicate_speech',
      foundJob: true,
      updated: false,
    })
    res.type('text/xml').send(buildAiGatherTwiml({ callJobId, reason, spoken: 'I heard you. Please continue.', state }))
    return
  }

  try {
    await createCallEventOnce({
      callJobId,
      twilioCallSid,
      eventType: 'patient_speech_received',
      eventKey,
      payload: { step, hasSpeech: Boolean(speech.trim()) },
    })

    const { turn, history: updatedHistory } = await runAiCallTurn({
      reason,
      ctx,
      history,
      userText,
    })

    const escalation = needsStaffFollowUp(userText, reason)
    if (escalation.needed && turn.action === 'continue') {
      turn.action = 'transfer'
      turn.patientResponse = turn.patientResponse ?? `Escalation: ${escalation.reason}`
    }

    const needsStaff = turn.action === 'transfer' || turn.action === 'callback'
    const callStatus =
      turn.action === 'transfer'
        ? 'escalated'
        : turn.action === 'callback'
          ? 'callback_requested'
          : turn.action === 'complete'
            ? 'completed'
            : 'in_progress'

    const aiSummary = turn.summary ?? buildAiSummary(reason, turn.patientResponse ?? userText)
    const withPatientTurn = transcriptJsonWith(job.transcriptJson, {
      eventKey,
      mode: 'ai',
      speaker: 'patient',
      step: 'speech_turn',
      text: userText,
      input: userText,
      action: turn.action,
    })
    const withAiTurn = transcriptJsonWith(withPatientTurn, {
      eventKey: callbackEventKey([eventKey, 'ai_transcript']),
      mode: 'ai',
      speaker: 'ai',
      step: 'speech_turn',
      text: turn.spoken,
      result: turn.patientResponse ?? undefined,
      action: turn.action,
      summary: aiSummary,
    })

    // If DOB was just verified on this turn, persist a sentinel so future turns know
    const finalHistory = (turn.dobVerified && !dobAlreadyVerified)
      ? [...updatedHistory, { role: 'system' as const, content: '__DOB_VERIFIED__' }]
      : updatedHistory

    const aiTransition = canTransitionCallStatus(job.callStatus ?? 'in_progress', callStatus, 'ai_turn')
    if (!aiTransition.allowed) {
      await createCallEventOnce({
        callJobId,
        twilioCallSid,
        eventType: 'status_transition_blocked',
        eventKey: callbackEventKey([twilioCallSid ?? callJobId, job.callStatus ?? '', callStatus, 'ai_blocked']),
        payload: { currentStatus: job.callStatus, requestedStatus: callStatus, source: 'ai_turn', reason: aiTransition.reason },
      })
      res.type('text/xml').send('<Response><Hangup/></Response>')
      return
    }

    const updated = await updateCallJobIfPossible(callJobId, {
      patientResponse: turn.patientResponse,
      aiSummary,
      messagesJson: JSON.stringify(finalHistory),
      staffFollowUpNeeded: needsStaff,
      followUpReason: needsStaff ? turn.patientResponse ?? turn.summary ?? null : null,
      callStatus,
      callCompletedAt: turn.action === 'continue' || turn.action === 'transfer' ? null : new Date(),
      resolutionStatus: turn.action === 'complete' ? 'resolved' : turn.action,
      transcriptJson: withAiTurn,
    })

    await createCallEventOnce({
      callJobId,
      twilioCallSid,
      eventType: 'ai_response_generated',
      eventKey: callbackEventKey([eventKey, 'ai_response']),
      payload: { action: turn.action, callStatus },
    })

    if (needsStaff) {
      const outcome = resolveOutcomeFromPatientAction({
        patientResponse: turn.patientResponse ?? turn.summary ?? userText,
        action: turn.action === 'transfer' || turn.action === 'callback' ? turn.action : undefined,
        callReason: reason,
      })
      if (outcome) {
        await ensureFollowUpTaskForCallOutcome(
          {
            id: callJobId,
            patientName: job.patientName,
            phoneNumber: job.phoneNumber,
            medicationName: job.medicationName,
            callReason: reason,
            callStatus,
            patientResponse: turn.patientResponse,
            followUpReason: turn.patientResponse ?? turn.summary ?? null,
            staffFollowUpNeeded: true,
            aiSummary,
          },
          outcome,
        ).catch(() => null)
        await createCallEventOnce({
          callJobId,
          twilioCallSid,
          eventType: 'follow_up_created',
          eventKey: callbackEventKey([eventKey, 'follow_up', outcome]),
          payload: { outcome },
        })
      }
    }

    if (turn.action === 'complete') {
      await createCallEventOnce({
        callJobId,
        twilioCallSid,
        eventType: 'summary_generated',
        eventKey: callbackEventKey([eventKey, 'summary']),
        payload: { callStatus },
      })
      await createAuditEvent('call_job', callJobId, 'AI_CALL_COMPLETED', 'AI outbound call completed.', {
        callStatus,
        twilioCallSid: maskSid(twilioCallSid),
      }).catch(() => null)

      // Send SMS follow-up after confirmed refill
      sendSmsFollowUp({
        to: job.phoneNumber,
        patientName: job.patientName,
        medicationName: job.medicationName,
        prescriptionsJson: job.prescriptionsJson,
        callReason: reason,
        patientResponse: turn.patientResponse,
      }).then((smsResult) => {
        if (smsResult !== 'disabled') {
          return updateCallJobIfPossible(callJobId, { smsStatus: smsResult })
        }
      }).catch(() => null)
    }

    logCallbackDiagnostic({
      route: '/api/twilio/voice-response',
      callJobId,
      twilioCallSid,
      twilioStatus: callStatus,
      foundJob: true,
      updated,
    })

    if (turn.action === 'continue') {
      res.type('text/xml').send(buildAiGatherTwiml({ callJobId, reason, spoken: turn.spoken, state }))
      return
    }

    res.type('text/xml').send(buildAiClosingTwiml(turn.spoken, turn.action === 'transfer' ? 'transfer' : turn.action === 'callback' ? 'callback' : 'complete'))
  } catch (error) {
    logCallbackDiagnostic({
      route: '/api/twilio/voice-response',
      callJobId,
      twilioCallSid,
      twilioStatus: 'ai_error',
      foundJob: true,
      updated: false,
      error,
    })
    res.type('text/xml').send(buildAiClosingTwiml('We are having technical difficulties. A team member will follow up.', 'callback'))
  }
}

twilioRouter.post('/twilio/recording-status', async (req, res) => {
  const body = req.body as Record<string, string>
  const query = req.query as Record<string, string>
  const { RecordingUrl, RecordingStatus, RecordingSid, RecordingDuration, CallSid } = body
  const callJobId = query.callJobId

  if (RecordingStatus === 'completed' && RecordingUrl) {
    const mp3Url = `${RecordingUrl}.mp3`
    const durationSec = RecordingDuration ? Math.round(Number(RecordingDuration)) : undefined
    const recordingData = {
      recordingUrl: mp3Url,
      ...(RecordingSid ? { recordingSid: RecordingSid } : {}),
      ...(durationSec != null && !Number.isNaN(durationSec) ? { recordingDuration: durationSec } : {}),
    }
    const job = callJobId
      ? await prisma.callJob.update({ where: { id: callJobId }, data: recordingData }).catch(() => null)
      : await prisma.callJob
          .findFirst({ where: { twilioCallSid: CallSid } })
          .then((j) =>
            j ? prisma.callJob.update({ where: { id: j.id }, data: recordingData }).catch(() => null) : null,
          )
          .catch(() => null)
    if (job) {
      await createCallEventOnce({
        callJobId: job.id,
        twilioCallSid: CallSid,
        eventType: 'recording_available',
        eventKey: callbackEventKey([RecordingSid, CallSid, job.id, 'recording_available']),
        payload: {
          recordingSid: RecordingSid ?? null,
          recordingDuration: durationSec ?? null,
          recordingStatus: RecordingStatus,
        },
      })
    }
  }

  res.status(204).send()
})

twilioRouter.get('/twilio/voice-response', handleVoiceResponse)
twilioRouter.post('/twilio/voice-response', handleVoiceResponse)
