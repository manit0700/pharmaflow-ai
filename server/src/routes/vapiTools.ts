import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyDob } from '../services/dob.js'
import { sendSmsFollowUp } from '../services/sms.js'
import { ensureFollowUpTaskForCallOutcome } from '../services/followUpTasks.js'

export const vapiToolsRouter = Router()

type VapiToolBody = Record<string, unknown>

// VAPI sends call.id and call.metadata.callJobId automatically in every tool call
function extractCallId(body: VapiToolBody): string | null {
  const direct = typeof body.callId === 'string' ? body.callId : null
  const fromCall = typeof (body.call as Record<string, unknown>)?.id === 'string'
    ? String((body.call as Record<string, unknown>).id)
    : null
  return direct || fromCall || null
}

function extractCallJobId(body: VapiToolBody): string | null {
  const meta = (body.call as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
  return (typeof meta?.callJobId === 'string' ? meta.callJobId : null) ?? extractCallId(body)
}

async function findCallJob(callId: string) {
  return prisma.callJob.findFirst({
    where: { OR: [{ id: callId }, { vapiCallId: callId }, { twilioCallSid: callId }] },
  })
}

function copayAmount(job: { prescriptionCost: number | null }) {
  return job.prescriptionCost ?? null
}

vapiToolsRouter.post('/tools/verify-dob', async (req, res) => {
  const body = req.body as VapiToolBody
  const dateOfBirth = typeof body.dateOfBirth === 'string' ? body.dateOfBirth : null
  const callId = extractCallJobId(body) ?? extractCallId(body)
  const job = callId ? await findCallJob(callId) : null
  if (!job) { res.status(404).json({ verified: false, message: 'Call job not found' }); return }

  const verified = verifyDob(String(dateOfBirth ?? ''), job.dob)
  console.log(`[vapi:verify-dob] job=${job.id} dob_provided=${dateOfBirth} dob_on_file=${job.dob} verified=${verified}`)
  if (!verified) {
    await prisma.callJob.update({
      where: { id: job.id },
      data: { staffFollowUpNeeded: true, followUpReason: 'DOB did not match during VAPI call' },
    })
    res.json({ verified: false, message: 'DOB did not match' })
    return
  }

  const updated = await prisma.callJob.update({
    where: { id: job.id },
    data: { conversationState: 'REFILL_DISCUSSION', verificationPassed: true },
  })
  res.json({
    verified: true,
    patientName: updated.patientName,
    medicationName: updated.medicationName,
    copayAmount: copayAmount(updated),
    hasCardOnFile: false,
  })
})

vapiToolsRouter.post('/tools/confirm-refill', async (req, res) => {
  const body = req.body as VapiToolBody
  const callId = extractCallJobId(body) ?? extractCallId(body)
  const confirmed = body.confirmed === true || body.confirmed === 'true'
  const job = callId ? await findCallJob(callId) : null
  if (!job) { res.status(404).json({ error: 'Call job not found' }); return }

  if (!confirmed) {
    await prisma.callJob.update({
      where: { id: job.id },
      data: {
        patientResponse: 'Not ready for refill yet',
        conversationState: 'COMPLETED',
        callStatus: 'completed',
        callCompletedAt: new Date(),
      },
    })
    res.json({ confirmed: false })
    return
  }

  const updated = await prisma.callJob.update({
    where: { id: job.id },
    data: { patientResponse: 'Confirmed refill — process today', conversationState: 'PAYMENT_SELECTION' },
  })
  res.json({ confirmed: true, copayAmount: copayAmount(updated), hasCardOnFile: false })
})

vapiToolsRouter.post('/tools/select-payment', async (req, res) => {
  const body = req.body as VapiToolBody
  const callId = extractCallJobId(body) ?? extractCallId(body)
  // Normalize VAPI enum (PAYMENT_LINK / CARD_ON_FILE) to our internal values
  const raw = String(body.choice ?? body.paymentChoice ?? '').toLowerCase().replace(/_/g, '_')
  const choice = (raw === 'payment_link' || raw === 'card_on_file') ? raw as 'card_on_file' | 'payment_link'
    : raw.includes('link') ? 'payment_link' : raw.includes('card') ? 'card_on_file' : null
  const job = callId ? await findCallJob(callId) : null
  if (!job || !choice) {
    res.status(400).json({ error: 'Valid callId and payment choice are required' })
    return
  }
  await prisma.callJob.update({
    where: { id: job.id },
    data: {
      paymentChoice: choice,
      paymentStatus: choice === 'payment_link' ? 'link_requested' : 'pending',
      conversationState: 'FULFILLMENT_CHOICE',
      staffFollowUpNeeded: choice === 'payment_link' ? true : job.staffFollowUpNeeded,
      followUpReason: choice === 'payment_link' ? 'Patient requested payment link' : job.followUpReason,
    },
  })
  res.json({ success: true, choice })
})

vapiToolsRouter.post('/tools/select-fulfillment', async (req, res) => {
  const body = req.body as VapiToolBody
  const callId = extractCallJobId(body) ?? extractCallId(body)
  // Normalize VAPI enum (PICKUP / DELIVERY) to our internal values
  const raw = String(body.choice ?? body.fulfillmentChoice ?? '').toLowerCase()
  const choice = raw === 'pickup' || raw === 'delivery' ? raw : null
  const deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress : undefined
  const job = callId ? await findCallJob(callId) : null
  if (!job || !choice) {
    res.status(400).json({ error: 'Valid callId and fulfillment choice are required' })
    return
  }
  const updated = await prisma.callJob.update({
    where: { id: job.id },
    data: {
      fulfillmentChoice: choice,
      deliveryAddress: deliveryAddress || null,
      conversationState: 'COMPLETED',
      callStatus: 'completed',
      callCompletedAt: new Date(),
      resolutionStatus: 'resolved',
    },
  })
  await sendSmsFollowUp({
    to: updated.phoneNumber,
    patientName: updated.patientName,
    medicationName: updated.medicationName,
    prescriptionsJson: updated.prescriptionsJson,
    callReason: updated.callReason,
    patientResponse: updated.patientResponse,
  }).catch(() => 'failed')
  res.json({ success: true })
})

vapiToolsRouter.post('/tools/request-escalation', async (req, res) => {
  const body = req.body as VapiToolBody
  const callId = extractCallJobId(body) ?? extractCallId(body)
  const reason = typeof body.reason === 'string' ? body.reason : undefined
  const job = callId ? await findCallJob(callId) : null
  if (!job) { res.status(404).json({ error: 'Call job not found' }); return }
  const updated = await prisma.callJob.update({
    where: { id: job.id },
    data: {
      callStatus: 'escalated',
      staffFollowUpNeeded: true,
      followUpReason: reason || 'Patient requested staff escalation',
      resolutionStatus: 'escalated',
    },
  })
  await ensureFollowUpTaskForCallOutcome(updated, 'escalated').catch(() => null)
  res.json({ success: true })
})
