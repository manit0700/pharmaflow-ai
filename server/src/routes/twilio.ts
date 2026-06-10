import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import { buildInboundTwiml } from '../services/twilio.js'
import { buildAiSummary } from '../services/script.js'
import { needsStaffFollowUp } from '../services/safety.js'
import { loadMessageHistory, runAiCallTurn } from '../services/callAi.js'
import {
  buildAiClosingTwiml,
  buildAiGatherTwiml,
  buildAiGreetingTwiml,
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
import { getCallScript } from '../services/callScripts.js'
import { decodeCallbackState } from '../services/callbackState.js'
import type { CallReason } from '../config.js'

export const twilioRouter = Router()

function normalizeTwilioStatus(status?: string): string | undefined {
  if (!status) return undefined
  if (status === 'answered' || status === 'in-progress') return 'in_progress'
  if (status === 'no-answer') return 'no_answer'
  if (status === 'busy') return 'no_answer'
  if (status === 'canceled' || status === 'cancelled') return 'no_answer'
  if (status === 'ringing') return 'ringing'
  if (status === 'initiated' || status === 'queued') return 'queued_live'
  return status
}

type TranscriptEntry = {
  at: string
  mode: 'dtmf' | 'ai' | 'system'
  step: string
  input?: string
  result?: string
  action?: string
  summary?: string
}

function transcriptJsonWith(
  existing: string | null | undefined,
  entry: Omit<TranscriptEntry, 'at'>,
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
  entries.push({ at: new Date().toISOString(), ...entry })
  return JSON.stringify(entries.slice(-40))
}

async function updateCallJobIfPossible(
  callJobId: string,
  data: Parameters<typeof prisma.callJob.update>[0]['data'],
) {
  try {
    await prisma.callJob.update({ where: { id: callJobId }, data })
  } catch {
    // Twilio still needs valid TwiML even when demo SQLite storage is unavailable.
  }
}

async function createCallEventIfPossible(data: Parameters<typeof prisma.callEvent.create>[0]['data']) {
  try {
    await prisma.callEvent.create({ data })
  } catch {
    // Non-critical staff audit event.
  }
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

  const job =
    (await prisma.callJob.findFirst({ where: { twilioCallSid: CallSid } }).catch(() => null)) ??
    (query.callJobId
      ? await prisma.callJob.findUnique({ where: { id: query.callJobId } }).catch(() => null)
      : null)
  if (job) {
    await createCallEventIfPossible({
      callJobId: job.id,
      twilioCallSid: CallSid,
      eventType: `status_${CallStatus}`,
      eventPayload: JSON.stringify(req.body),
    })

    const normalizedStatus = normalizeTwilioStatus(CallStatus)
    const completed = ['completed', 'busy', 'failed', 'no_answer', 'canceled'].includes(normalizedStatus ?? '')
    await updateCallJobIfPossible(job.id, {
      callStatus: normalizedStatus ?? job.callStatus,
      callCompletedAt: completed ? new Date() : job.callCompletedAt,
      callDuration: CallDuration ? Number(CallDuration) : job.callDuration,
      errorMessage: ErrorCode ? `${ErrorCode}: ${ErrorMessage ?? 'Twilio call error'}` : job.errorMessage,
      staffFollowUpNeeded: normalizedStatus === 'failed' || normalizedStatus === 'no_answer' ? true : job.staffFollowUpNeeded,
      followUpReason:
        normalizedStatus === 'failed' || normalizedStatus === 'no_answer'
          ? `Call ended with status ${normalizedStatus}`
          : job.followUpReason,
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        mode: 'system',
        step: 'twilio_status',
        input: CallStatus,
        result: normalizedStatus ?? CallStatus,
        summary: ErrorCode ? `${ErrorCode}: ${ErrorMessage ?? 'Twilio call error'}` : undefined,
      }),
    })
  }

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
  const speech = body.SpeechResult ?? ''
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

  if (body.AnsweredBy === 'machine_start' || body.AnsweredBy === 'machine_end_beep') {
    await updateCallJobIfPossible(callJobId, {
      callStatus: 'voicemail',
      patientResponse: 'Voicemail',
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        mode: 'system',
        step: 'answered_by',
        input: body.AnsweredBy,
        result: 'Voicemail',
      }),
    })
    res.type('text/xml').send(buildVoicemailTwiml(reason, ctx))
    return
  }

  if (mode === 'ai') {
    await handleAiVoiceResponse(res, { callJobId, step, reason, ctx, job, speech, digits, state })
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
    const maskedDigits = digits
    if (verifyDob(digits, job.dob)) {
      await updateCallJobIfPossible(callJobId, {
        patientResponse: 'DOB verified',
        callStatus: 'in_progress',
        transcriptJson: transcriptJsonWith(job.transcriptJson, {
          mode: 'dtmf',
          step: 'dob',
          input: maskedDigits,
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
          input: maskedDigits,
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
        input: maskedDigits,
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
        step: 'menu',
        input: digits.charAt(0),
        result: option.patientResponse,
        action: option.action,
        summary: aiSummary,
      }),
    })

    if (needsStaff) {
      await createStaffTask({
        callJobId,
        patientName: job.patientName,
        phoneNumber: job.phoneNumber,
        medicationName: job.medicationName,
        taskType: option.action === 'callback' ? 'callback_request' : 'patient_request',
        priority: option.action === 'transfer' ? 'urgent' : 'normal',
        notes: option.patientResponse,
        aiSummary,
      })
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
      patientResponse?: string | null
      messagesJson: string | null
      transcriptJson: string | null
    }
    speech: string
    digits?: string
    state?: string
  },
) {
  const { callJobId, step, reason, ctx, job, speech, digits, state } = params

  // Hybrid mode: in AI calls, also accept keypad input.
  if (digits && /^\d+$/.test(digits)) {
    if (step === 'ai_greeting' || step === 'greeting') {
      if (digits.length < 4) {
        // During AI greeting, keypad input is reserved for DOB verification.
        // Do not treat partial digits as menu actions to avoid accidental transfer.
        res.type('text/xml').send(buildAiGreetingTwiml({ callJobId, reason, ctx, state }))
        return
      }
      await handleDtmfVoiceResponse(res, {
        callJobId,
        step: 'dob',
        reason,
        ctx,
        job: {
          id: job.id,
          dob: job.dob ?? '',
          patientName: job.patientName,
          phoneNumber: job.phoneNumber,
          medicationName: job.medicationName,
          patientResponse: job.patientResponse ?? null,
          transcriptJson: job.transcriptJson,
        },
        digits: digits.slice(0, 4),
        state,
      })
      return
    }

    if ((step === 'ai' || step === 'menu') && digits.length >= 1) {
      await handleDtmfVoiceResponse(res, {
        callJobId,
        step: 'menu',
        reason,
        ctx,
        job: {
          id: job.id,
          dob: job.dob ?? '',
          patientName: job.patientName,
          phoneNumber: job.phoneNumber,
          medicationName: job.medicationName,
          patientResponse: job.patientResponse ?? null,
          transcriptJson: job.transcriptJson,
        },
        digits: digits.charAt(0),
        state,
      })
      return
    }
  }

  if (step === 'ai_greeting' || (step === 'greeting' && !speech)) {
    res.type('text/xml').send(buildAiGreetingTwiml({ callJobId, reason, ctx, state }))
    return
  }

  const userText = speech.trim() || '(no speech detected)'
  const history = loadMessageHistory(job.messagesJson)

  try {
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
    await updateCallJobIfPossible(callJobId, {
      patientResponse: turn.patientResponse,
      aiSummary,
      messagesJson: JSON.stringify(updatedHistory),
      staffFollowUpNeeded: needsStaff,
      followUpReason: needsStaff ? turn.patientResponse ?? turn.summary ?? null : null,
      callStatus,
      callCompletedAt: turn.action === 'continue' || turn.action === 'transfer' ? null : new Date(),
      resolutionStatus: turn.action === 'complete' ? 'resolved' : turn.action,
      transcriptJson: transcriptJsonWith(job.transcriptJson, {
        mode: 'ai',
        step: 'speech_turn',
        input: userText,
        result: turn.patientResponse ?? undefined,
        action: turn.action,
        summary: aiSummary,
      }),
    })

    if (needsStaff) {
      await createStaffTask({
        callJobId,
        patientName: job.patientName,
        phoneNumber: job.phoneNumber,
        medicationName: job.medicationName,
        taskType: turn.action === 'callback' ? 'callback_request' : 'patient_request',
        priority: turn.action === 'transfer' ? 'urgent' : 'normal',
        notes: turn.patientResponse ?? turn.summary ?? userText,
        aiSummary: turn.summary,
      })
    }

    if (turn.action === 'continue') {
      res.type('text/xml').send(buildAiGatherTwiml({ callJobId, reason, spoken: turn.spoken, state }))
      return
    }

    res.type('text/xml').send(buildAiClosingTwiml(turn.spoken, turn.action === 'transfer' ? 'transfer' : turn.action === 'callback' ? 'callback' : 'complete'))
  } catch {
    res.type('text/xml').send(buildAiClosingTwiml('We are having technical difficulties. A team member will follow up. Goodbye.', 'callback'))
  }
}

twilioRouter.get('/twilio/voice-response', handleVoiceResponse)
twilioRouter.post('/twilio/voice-response', handleVoiceResponse)
