import { config } from '../config.js'
import { getTwilioClient } from '../lib/twilioAuth.js'

export interface SmsFollowUpParams {
  to: string
  patientName: string
  medicationName: string
  prescriptionsJson?: string | null
  callReason: string
  patientResponse: string | null
}

function buildSmsBody(params: SmsFollowUpParams): string {
  const firstName = params.patientName.trim().split(/\s+/)[0] ?? params.patientName

  let medList = params.medicationName
  if (params.prescriptionsJson) {
    try {
      const rxs = JSON.parse(params.prescriptionsJson) as Array<{ name: string; cost?: number }>
      if (Array.isArray(rxs) && rxs.length > 1) {
        medList = rxs.map((rx) => rx.name).join(', ')
      }
    } catch { /* ignore */ }
  }

  const response = (params.patientResponse ?? '').toLowerCase()
  const isConfirmed =
    response.includes('confirmed') ||
    response.includes('process today') ||
    response.includes('yes')

  if (isConfirmed) {
    return (
      `Hi ${firstName}, this is ${config.pharmacyName}. ` +
      `Your refill for ${medList} has been confirmed and is being processed. ` +
      `It will be ready for pickup shortly. Reply STOP to opt out.`
    )
  }

  return (
    `Hi ${firstName}, this is ${config.pharmacyName}. ` +
    `We tried to reach you about your prescription for ${medList}. ` +
    `Please call us or stop by when you are ready. Reply STOP to opt out.`
  )
}

export async function sendSmsFollowUp(params: SmsFollowUpParams): Promise<'sent' | 'disabled' | 'failed'> {
  if (!config.enableSmsFollowup) return 'disabled'
  const client = getTwilioClient()
  if (!client || !config.twilioSmsNumber) return 'disabled'

  try {
    await client.messages.create({
      to: params.to,
      from: config.twilioSmsNumber,
      body: buildSmsBody(params),
    })
    return 'sent'
  } catch {
    return 'failed'
  }
}
