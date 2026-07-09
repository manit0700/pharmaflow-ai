import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyDob } from '../services/dob.js'
import { sendSmsFollowUp } from '../services/sms.js'
import { ensureFollowUpTaskForCallOutcome } from '../services/followUpTasks.js'

export const vapiToolsRouter = Router()

type VapiToolBody = Record<string, unknown>

// VAPI wraps tool call payloads in a {message: {...}} envelope.
// call object (id + metadata) lives at body.message.call.
// Tool arguments live at body.message.toolCallList[0].function.arguments.
function msgObj(body: VapiToolBody): Record<string, unknown> | undefined {
  return body.message as Record<string, unknown> | undefined
}

function callObj(body: VapiToolBody): Record<string, unknown> | undefined {
  return (msgObj(body)?.call ?? body.call) as Record<string, unknown> | undefined
}

function toolArgs(body: VapiToolBody): Record<string, unknown> {
  const msg = msgObj(body)
  const list = (msg?.toolCallList ?? msg?.toolCalls) as Array<Record<string, unknown>> | undefined
  if (Array.isArray(list) && list.length > 0) {
    const args = (list[0]?.function as Record<string, unknown>)?.arguments
    if (args && typeof args === 'object') return args as Record<string, unknown>
  }
  return body
}

// VAPI requires {results: [{toolCallId, result}]} — plain JSON objects return "No result returned"
function toolCallId(body: VapiToolBody): string | undefined {
  const msg = msgObj(body)
  const list = (msg?.toolCallList ?? msg?.toolCalls) as Array<Record<string, unknown>> | undefined
  return Array.isArray(list) && list.length > 0 ? String(list[0]?.id ?? '') : undefined
}

function vapiResult(id: string | undefined, result: string): object {
  return { results: [{ toolCallId: id, result }] }
}

function extractCallId(body: VapiToolBody): string | null {
  const call = callObj(body)
  const fromCall = typeof call?.id === 'string' ? call.id : null
  const direct = typeof body.callId === 'string' ? body.callId : null
  return fromCall || direct || null
}

function extractCallJobId(body: VapiToolBody): string | null {
  const call = callObj(body)
  const meta = call?.metadata as Record<string, unknown> | undefined
  const fromMeta = typeof meta?.callJobId === 'string' ? meta.callJobId : null
  return fromMeta ?? extractCallId(body)
}

async function findCallJob(callId: string) {
  return prisma.callJob.findFirst({
    where: { OR: [{ id: callId }, { vapiCallId: callId }, { twilioCallSid: callId }] },
  })
}

function copayAmount(job: { prescriptionCost: number | null }) {
  return job.prescriptionCost ?? null
}

vapiToolsRouter.post(['/tools/verify-dob', '/tools/verify-patient', '/tools/verifyPatient'], async (req, res) => {
  const body = req.body as VapiToolBody
  console.log('[vapi:verify-dob] raw body:', JSON.stringify(body).slice(0, 2000))
  const args = toolArgs(body)
  const tcId = toolCallId(body)
  const dateOfBirth = typeof args.dateOfBirth === 'string' ? args.dateOfBirth : null
  const callId = extractCallJobId(body) ?? extractCallId(body)
  console.log('[vapi:verify-dob] extracted callId:', callId, '| dob:', dateOfBirth)

  const job = callId ? await findCallJob(callId) : null
  if (!job) {
    console.log('[vapi:verify-dob] job NOT FOUND for callId:', callId)
    res.json(vapiResult(tcId, 'Verification failed: call session not found. Pharmacy staff will follow up.'))
    return
  }

  const verified = verifyDob(String(dateOfBirth ?? ''), job.dob)
  console.log(`[vapi:verify-dob] job=${job.id} dob_provided=${dateOfBirth} dob_on_file=${job.dob} verified=${verified}`)

  if (!verified) {
    await prisma.callJob.update({
      where: { id: job.id },
      data: { staffFollowUpNeeded: true, followUpReason: 'DOB did not match during VAPI call' },
    })
    res.json(vapiResult(tcId, 'Verification failed: the date of birth did not match our records. Please ask the patient to try again.'))
    return
  }

  const updated = await prisma.callJob.update({
    where: { id: job.id },
    data: { conversationState: 'REFILL_DISCUSSION', verificationPassed: true },
  })

  const copay = copayAmount(updated)
  const copayText = copay != null ? `Copay amount: $${copay}.` : 'No copay on file.'
  res.json(vapiResult(tcId,
    `Verification successful. Patient name: ${updated.patientName}. Medication: ${updated.medicationName || 'on file'}. ${copayText} Card on file: No.`
  ))
})

vapiToolsRouter.post('/tools/confirm-refill', async (req, res) => {
  const body = req.body as VapiToolBody
  const callId = extractCallJobId(body) ?? extractCallId(body)
  const args = toolArgs(body)
  const tcId = toolCallId(body)
  const confirmed = args.confirmed === true || args.confirmed === 'true'
  const job = callId ? await findCallJob(callId) : null
  if (!job) {
    res.json(vapiResult(tcId, 'Error: call session not found.'))
    return
  }

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
    res.json(vapiResult(tcId, 'Refill declined. Patient is not ready for a refill at this time.'))
    return
  }

  const updated = await prisma.callJob.update({
    where: { id: job.id },
    data: { patientResponse: 'Confirmed refill — process today', conversationState: 'PAYMENT_SELECTION' },
  })
  const copay = copayAmount(updated)
  const copayText = copay != null ? `Copay amount: $${copay}.` : 'No copay amount on file.'
  res.json(vapiResult(tcId, `Refill confirmed. ${copayText} Card on file: No. Please ask for payment preference: payment link or card on file.`))
})

vapiToolsRouter.post('/tools/select-payment', async (req, res) => {
  const body = req.body as VapiToolBody
  const callId = extractCallJobId(body) ?? extractCallId(body)
  const args = toolArgs(body)
  const tcId = toolCallId(body)
  const raw = String(args.choice ?? args.paymentChoice ?? '').toLowerCase()
  const choice = (raw === 'payment_link' || raw === 'card_on_file') ? raw as 'card_on_file' | 'payment_link'
    : raw.includes('link') ? 'payment_link' : raw.includes('card') ? 'card_on_file' : null
  const job = callId ? await findCallJob(callId) : null
  if (!job || !choice) {
    res.json(vapiResult(tcId, 'Error: could not record payment preference. Please ask the patient again.'))
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
  const label = choice === 'payment_link' ? 'payment link' : 'card on file'
  res.json(vapiResult(tcId, `Payment preference recorded: ${label}. Now ask whether the patient prefers pickup or home delivery.`))
})

vapiToolsRouter.post('/tools/select-fulfillment', async (req, res) => {
  const body = req.body as VapiToolBody
  const callId = extractCallJobId(body) ?? extractCallId(body)
  const args = toolArgs(body)
  const tcId = toolCallId(body)
  const raw = String(args.choice ?? args.fulfillmentChoice ?? '').toLowerCase()
  const choice = raw === 'pickup' || raw === 'delivery' ? raw : null
  const deliveryAddress = typeof args.deliveryAddress === 'string' ? args.deliveryAddress : undefined
  const job = callId ? await findCallJob(callId) : null
  if (!job || !choice) {
    res.json(vapiResult(tcId, 'Error: could not record fulfillment preference. Please ask the patient again.'))
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
  const label = choice === 'pickup' ? 'pharmacy pickup' : `home delivery${deliveryAddress ? ` to ${deliveryAddress}` : ''}`
  res.json(vapiResult(tcId, `Fulfillment preference recorded: ${label}. All preferences have been saved. Pharmacy staff will complete the next steps.`))
})

vapiToolsRouter.post('/tools/request-escalation', async (req, res) => {
  const body = req.body as VapiToolBody
  const callId = extractCallJobId(body) ?? extractCallId(body)
  const args = toolArgs(body)
  const tcId = toolCallId(body)
  const reason = typeof args.reason === 'string' ? args.reason : undefined
  const job = callId ? await findCallJob(callId) : null
  if (!job) {
    res.json(vapiResult(tcId, 'Error: call session not found.'))
    return
  }
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
  res.json(vapiResult(tcId, 'Escalation recorded. Pharmacy staff will follow up with the patient directly.'))
})
