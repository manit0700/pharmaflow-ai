import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { scheduleOutcomeRetry } from '../services/voicemailRetry.js'
import { vapiToolsRouter } from './vapiTools.js'

export const vapiRouter = Router()

type VapiPayload = Record<string, unknown>

function nested(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

function stringAt(obj: unknown, path: string[]): string | null {
  const value = nested(obj, path)
  return typeof value === 'string' && value.trim() ? value : null
}

function callJobIdFrom(payload: VapiPayload): string | null {
  return (
    stringAt(payload, ['call', 'metadata', 'callJobId']) ??
    stringAt(payload, ['message', 'call', 'metadata', 'callJobId']) ??
    stringAt(payload, ['metadata', 'callJobId'])
  )
}

function callIdFrom(payload: VapiPayload): string | null {
  return (
    stringAt(payload, ['call', 'id']) ??
    stringAt(payload, ['message', 'call', 'id']) ??
    stringAt(payload, ['callId'])
  )
}

function eventType(payload: VapiPayload): string {
  return (
    stringAt(payload, ['type']) ??
    stringAt(payload, ['message', 'type']) ??
    stringAt(payload, ['event']) ??
    'unknown'
  )
}

function transcriptFrom(payload: VapiPayload): string | null {
  const direct =
    stringAt(payload, ['artifact', 'transcript']) ??
    stringAt(payload, ['message', 'artifact', 'transcript']) ??
    stringAt(payload, ['transcript'])
  if (direct) return direct
  const messages = nested(payload, ['message', 'artifact', 'messages']) ?? nested(payload, ['artifact', 'messages'])
  return Array.isArray(messages) ? JSON.stringify(messages) : null
}

vapiRouter.use(vapiToolsRouter)

vapiRouter.post('/webhook', async (req, res) => {
  const payload = (req.body ?? {}) as VapiPayload
  const type = eventType(payload)
  const callJobId = callJobIdFrom(payload)
  const vapiCallId = callIdFrom(payload)

  if (!callJobId) {
    res.status(202).json({ received: true, ignored: 'missing callJobId' })
    return
  }

  try {
    if (type === 'call-started') {
      await prisma.callJob.update({
        where: { id: callJobId },
        data: { callStatus: 'in_progress', vapiCallId, twilioCallSid: vapiCallId, conversationState: 'GREETING' },
      })
    } else if (type === 'end-of-call-report') {
      await prisma.callJob.update({
        where: { id: callJobId },
        data: {
          callStatus: 'completed',
          callCompletedAt: new Date(),
          transcriptJson: transcriptFrom(payload),
          conversationState: 'COMPLETED',
          resolutionStatus: 'resolved',
        },
      })
    } else if (type === 'status-update') {
      const status = stringAt(payload, ['status']) ?? stringAt(payload, ['message', 'status'])
      const endedReason = stringAt(payload, ['endedReason']) ?? stringAt(payload, ['message', 'endedReason'])
      if (status === 'ended' && endedReason === 'voicemail') {
        await prisma.callJob.update({
          where: { id: callJobId },
          data: {
            callStatus: 'voicemail',
            callCompletedAt: new Date(),
            staffFollowUpNeeded: true,
            followUpReason: 'VAPI detected voicemail',
            resolutionStatus: 'pending',
          },
        })
        await scheduleOutcomeRetry(callJobId, 'voicemail').catch(() => null)
      }
    }

    if (vapiCallId) {
      await prisma.callEvent.create({
        data: {
          callJobId,
          twilioCallSid: vapiCallId,
          eventType: `vapi_${type}`,
          eventPayload: JSON.stringify({ type }),
        },
      }).catch(() => null)
    }

    res.json({ received: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'VAPI webhook failed' })
  }
})
