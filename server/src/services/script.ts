import type { CallReason } from '../config.js'
import { config } from '../config.js'
import { fillTemplate, getCallScript, type ScriptContext } from './callScripts.js'

export function greetingForOutbound(pharmacyName: string, ctx?: Partial<ScriptContext>, reason?: CallReason): string {
  if (reason && ctx?.patientName) {
    return fillTemplate(getCallScript(reason).greeting, {
      pharmacyName,
      patientName: ctx.patientName,
      medicationName: ctx.medicationName ?? '',
    })
  }
  return `Hello, this is ${pharmacyName} calling with a prescription-related update.`
}

export function scriptForReason(reason: CallReason, verified: boolean, ctx?: ScriptContext): string {
  const script = getCallScript(reason)
  if (!verified) return script.dobPrompt
  if (ctx) return script.mainMenu(ctx)
  return script.mainMenu({
    pharmacyName: config.pharmacyName,
    patientName: 'the patient',
    medicationName: 'your medication',
  })
}

export function inboundGreeting(): string {
  return `Thank you for calling ${config.pharmacyName}. Press 1 for refill, 2 for prescription status, 3 for delivery, 4 for store hours, or 0 to speak with staff.`
}

export function buildAiSummary(reason: CallReason, response: string): string {
  return `Outbound ${reason}: ${response}`
}
