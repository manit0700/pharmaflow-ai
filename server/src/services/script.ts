import type { CallReason } from '../config.js'
import { config } from '../config.js'

export function greetingForOutbound(pharmacyName: string): string {
  return `Hello, this is ${pharmacyName} calling with a prescription-related update.`
}

export function scriptForReason(reason: CallReason, verified: boolean): string {
  if (!verified) {
    return 'For your privacy, please confirm your date of birth before we discuss any prescription details.'
  }
  switch (reason) {
    case 'refill_reminder':
      return 'We are reaching out about a refill that may be due. Would you like us to process it today?'
    case 'pickup_reminder':
      return 'Your prescription is ready for pickup at the pharmacy.'
    case 'delivery_update':
      return 'We have an update about your prescription delivery status.'
    case 'insurance_update':
      return 'We need to discuss an insurance-related update with our pharmacy team.'
    case 'general_callback':
      return 'We are following up on a prescription matter. How can we help you today?'
    default:
      return 'How can we help you with your prescription today?'
  }
}

export function inboundGreeting(): string {
  return `Thank you for calling ${config.pharmacyName}. Press 1 for refill, 2 for prescription status, 3 for delivery, 4 for store hours, or 0 to speak with staff.`
}

export function buildAiSummary(reason: CallReason, response: string): string {
  return `Outbound ${reason}: patient response recorded. ${response.slice(0, 120)}`
}
