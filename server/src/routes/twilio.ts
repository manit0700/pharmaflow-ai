import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import { buildInboundTwiml } from '../services/twilio.js'
import { buildAiSummary } from '../services/script.js'
import { detectNonHumanAudio, needsStaffFollowUp } from '../services/safety.js'
import { loadMessageHistory, runAiCallTurn } from '../services/callAi.js'
import { sendSmsFollowUp } from '../services/sms.js'
import {
  buildAiClosingTwiml,
  buildAiDobRetryTwiml,
  buildAiGatherTwiml,
  buildAiGreetingTwiml,
  buildAiPostDobPrompt,
  buildDtmfClosingTwiml,
  buildDtmfDobRetryTwiml,
  buildDtmfGreetingTwiml,
  buildDtmfMenuTwiml,
  buildInboundAckTwiml,
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
  await prisma.inboundCall.create({
    data: {
      callerPhone: caller,
      status: 'active',
      intent: 'unknown',
    },
  }).catch(() => null)
  res.type('text/xml').send(buildInboundTwiml())
}

twilioRouter.get('/twilio/inbound', handleInbound)
twilioRouter.post('/twilio/inbound', handleInbound)

async function handleVoiceResponse(req: import('express').Request, res: import('express').Response) {
  const query = req.query as Record<string, string>
  const body = (req.body ?? {}) as Record<string, string>
  const digits = body.Digits ?? ''
  // Accept speech down to 0.25 confidence — the caller is the loudest voice on the line;
  // very low scores (< 0.25) are typically DTMF noise or silence, not real speech.
  const rawConf = body.Confidence !== undefined ? parseFloat(String(body.Confidence)) : 1.0
  const speechConf = Number.isNaN(rawConf) ? 1.0 : rawConf
  const speech = speechConf >= 0.25 ? (body.SpeechResult ?? '') : ''
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
    const intentMap: Record<string, string> = {
      '1': 'refill',
      '2': 'status',
      '3': 'delivery',
      '4': 'store_hours',
      '0': 'staff',
    }
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

  // AMD is intentionally NOT enabled on outbound calls (no machineDetection param in calls.create).
  // AnsweredBy is only present if AMD fires — which requires it to be explicitly enabled.
  // Only treat as voicemail when Twilio explicitly signals a machine answer.
  const machineAnsweredBy = new Set(['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax'])
  if (body.AnsweredBy && machineAnsweredBy.has(body.AnsweredBy)) {
    await updateCallJobIfPossible(callJobId, {
      callStatus: 'voicemail',
      patientResponse: 'Voicemail',
      staffFollowUpNeeded: true,
      followUpReason: 'Call went to voicemail — no live patient answer',
    })
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
    const script = getCallScript(reason)
    const spoken =
      fillTemplate(script.greeting, ctx) +
      ' To verify your identity, you can say or type your date of birth.'
    await updateCallJobIfPossible(callJobId, {
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        eventKey: greetingEventKey,
        mode: 'ai',
        speaker: 'ai',
        step: 'greeting',
        text: spoken,
      }),
    })
    res.type('text/xml').send(buildAiGreetingTwiml({ callJobId, reason, ctx, state }))
    return
  }

  const userText = speech.trim() || (digits ?? '').trim() || '(no speech detected)'

  const history = loadMessageHistory(job.messagesJson)

  // Count completed AI turns (1 assistant message = 1 turn)
  const aiTurns = history.filter((m) => m.role === 'assistant').length
  // Check if DOB has been verified in a prior turn
  const dobAlreadyVerified = history.some((m) => m.role === 'system' && m.content === '__DOB_VERIFIED__')

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
    res.type('text/xml').send('<Response><Hangup/></Response>')
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
