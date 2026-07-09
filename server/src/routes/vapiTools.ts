import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyDob } from '../services/dob.js'
import { sendSmsFollowUp } from '../services/sms.js'
import { ensureFollowUpTaskForCallOutcome } from '../services/followUpTasks.js'

export const vapiToolsRouter = Router()

async function findCallJob(callId: string) {
  return prisma.callJob.findFirst({
    where: { OR: [{ vapiCallId: callId }, { twilioCallSid: callId }] },
  })
}

function copayAmount(job: { prescriptionCost: number | null }) {
  return job.prescriptionCost ?? null
}

vapiToolsRouter.post('/tools/verify-dob', async (req, res) => {
  const { callId, dateOfBirth } = req.body as { callId?: string; dateOfBirth?: string }
  const job = callId ? await findCallJob(callId) : null
  if (!job) { res.status(404).json({ verified: false, message: 'Call job not found' }); return }

  const verified = verifyDob(String(dateOfBirth ?? ''), job.dob)
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
  const { callId, confirmed } = req.body as { callId?: string; confirmed?: boolean }
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
  const { callId, choice } = req.body as { callId?: string; choice?: 'card_on_file' | 'payment_link' }
  const job = callId ? await findCallJob(callId) : null
  if (!job || (choice !== 'card_on_file' && choice !== 'payment_link')) {
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
  const { callId, choice, deliveryAddress } = req.body as { callId?: string; choice?: string; deliveryAddress?: string }
  const job = callId ? await findCallJob(callId) : null
  if (!job || (choice !== 'pickup' && choice !== 'delivery')) {
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
  const { callId, reason } = req.body as { callId?: string; reason?: string }
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
