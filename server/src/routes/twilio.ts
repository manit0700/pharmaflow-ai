import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { buildInboundTwiml, buildOutboundTwiml } from '../services/twilio.js'
import { buildAiSummary } from '../services/script.js'
import { needsStaffFollowUp } from '../services/safety.js'
import type { CallReason } from '../config.js'

export const twilioRouter = Router()

function normalizeTwilioStatus(status?: string): string | undefined {
  if (!status) return undefined
  if (status === 'answered' || status === 'in-progress') return 'in_progress'
  if (status === 'no-answer') return 'no_answer'
  return status
}

twilioRouter.post('/twilio/status', async (req, res) => {
  const { CallSid, CallStatus, CallDuration, ErrorCode, ErrorMessage } = req.body as Record<string, string>

  const job = await prisma.callJob.findFirst({ where: { twilioCallSid: CallSid } })
  if (job) {
    await prisma.callEvent.create({
      data: {
        callJobId: job.id,
        twilioCallSid: CallSid,
        eventType: `status_${CallStatus}`,
        eventPayload: JSON.stringify(req.body),
      },
    })

    const normalizedStatus = normalizeTwilioStatus(CallStatus)
    const completed = ['completed', 'busy', 'failed', 'no_answer', 'canceled'].includes(normalizedStatus ?? '')
    await prisma.callJob.update({
      where: { id: job.id },
      data: {
        callStatus: normalizedStatus ?? job.callStatus,
        callCompletedAt: completed ? new Date() : job.callCompletedAt,
        callDuration: CallDuration ? Number(CallDuration) : job.callDuration,
        errorMessage: ErrorCode ? `${ErrorCode}: ${ErrorMessage ?? 'Twilio call error'}` : job.errorMessage,
        staffFollowUpNeeded: normalizedStatus === 'failed' || normalizedStatus === 'no_answer' ? true : job.staffFollowUpNeeded,
        followUpReason:
          normalizedStatus === 'failed' || normalizedStatus === 'no_answer'
            ? `Call ended with status ${normalizedStatus}`
            : job.followUpReason,
      },
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
  })
  res.type('text/xml').send(buildInboundTwiml())
}

twilioRouter.get('/twilio/inbound', handleInbound)
twilioRouter.post('/twilio/inbound', handleInbound)

async function handleVoiceResponse(req: import('express').Request, res: import('express').Response) {
  const query = req.query as Record<string, string>
  const body = (req.body ?? {}) as Record<string, string>
  const digits = body.Digits ?? ''
  const callJobId = query.callJobId
  const step = query.step ?? 'greeting'
  const reason = (query.reason ?? 'general_callback') as CallReason
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
    })

    if (intent === 'staff') {
      if (inbound.id) {
        await prisma.staffTask.create({
          data: {
            patientName: 'Inbound caller',
            phoneNumber: caller,
            taskType: 'inbound_handoff',
            priority: 'urgent',
            notes: 'Inbound caller pressed 0 for staff',
            aiSummary: inbound.summary,
          },
        })
      }
      res.type('text/xml').send(buildOutboundTwiml(reason, 'transfer'))
      return
    }

    const vr = buildOutboundTwiml(reason, 'verified')
    res.type('text/xml').send(vr)
    return
  }

  if (callJobId) {
    const job = await prisma.callJob.findUnique({ where: { id: callJobId } })
    if (!job) {
      res.type('text/xml').send(buildOutboundTwiml(reason, 'voicemail'))
      return
    }

    if (step === 'greeting' && digits.length >= 4) {
      const dobMatch = digits.replace(/\D/g, '') === job.dob.replace(/\D/g, '').slice(-4) ||
        job.dob.includes(digits)
      if (dobMatch) {
        await prisma.callJob.update({
          where: { id: callJobId },
          data: {
            patientResponse: 'DOB verified',
            aiSummary: buildAiSummary(reason, 'DOB verified on call'),
            callStatus: 'completed',
            callCompletedAt: new Date(),
          },
        })
        res.type('text/xml').send(buildOutboundTwiml(reason, 'verified'))
        return
      }
    }

    const speech = body.SpeechResult ?? ''
    const followUp = needsStaffFollowUp(speech, job.callReason)
    if (followUp.needed) {
      await prisma.callJob.update({
        where: { id: callJobId },
        data: {
          staffFollowUpNeeded: true,
          followUpReason: followUp.reason,
          callStatus: 'escalated',
        },
      })
      await prisma.staffTask.create({
        data: {
          callJobId,
          patientName: job.patientName,
          phoneNumber: job.phoneNumber,
          medicationName: job.medicationName,
          taskType: 'escalation',
          priority: 'high',
          notes: followUp.reason,
        },
      })
      res.type('text/xml').send(buildOutboundTwiml(reason, 'transfer'))
      return
    }

    if (body.AnsweredBy === 'machine_start' || body.AnsweredBy === 'machine_end_beep') {
      await prisma.callJob.update({
        where: { id: callJobId },
        data: { callStatus: 'voicemail', patientResponse: 'Voicemail' },
      })
      res.type('text/xml').send(buildOutboundTwiml(reason, 'voicemail'))
      return
    }
  }

  res.type('text/xml').send(buildOutboundTwiml(reason, step === 'greeting' ? 'greeting' : 'voicemail'))
}

twilioRouter.get('/twilio/voice-response', handleVoiceResponse)
twilioRouter.post('/twilio/voice-response', handleVoiceResponse)
