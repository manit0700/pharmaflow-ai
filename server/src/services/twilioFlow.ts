import twilio from 'twilio'
import { config, type CallReason } from '../config.js'
import {
  fillTemplate,
  getCallScript,
  resolveResponseOption,
  type ScriptContext,
} from './callScripts.js'
import { safeVoicemailMessage } from './safety.js'

function sayAttrs() {
  return { voice: config.twilioVoice } as { voice: 'Polly.Joanna' }
}

function slowSay(node: any, text: string): void {
  const say = node.say(sayAttrs())
  if (say.prosody) {
    say.prosody({ rate: '85%' }, text)
    return
  }
  node.say(sayAttrs(), text)
}

function startAfterPause(vr: twilio.twiml.VoiceResponse): void {
  vr.pause({ length: 2 })
}

function voiceResponseUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params)
  return `${config.publicBaseUrl}/api/twilio/voice-response?${qs.toString()}`
}

export function scriptContextFromJob(job: {
  patientName: string
  medicationName: string
}): ScriptContext {
  return {
    pharmacyName: config.pharmacyName,
    patientName: job.patientName,
    medicationName: job.medicationName,
  }
}

export function buildDtmfGreetingTwiml(params: {
  callJobId: string
  reason: CallReason
  ctx: ScriptContext
  state?: string
}): string {
  const vr = new twilio.twiml.VoiceResponse()
  const script = getCallScript(params.reason)

  startAfterPause(vr)
  slowSay(vr, fillTemplate(script.greeting, params.ctx))
  const gather = vr.gather({
    numDigits: 4,
    action: voiceResponseUrl({
      callJobId: params.callJobId,
      step: 'dob',
      reason: params.reason,
      mode: 'dtmf',
      ...(params.state ? { state: params.state } : {}),
    }),
    method: 'POST',
    timeout: 10,
  })
  slowSay(gather, script.dobPrompt)
  slowSay(vr, 'We did not receive a response. Goodbye.')
  return vr.toString()
}

export function buildDtmfMenuTwiml(params: {
  callJobId: string
  reason: CallReason
  ctx: ScriptContext
  state?: string
}): string {
  const vr = new twilio.twiml.VoiceResponse()
  const script = getCallScript(params.reason)

  startAfterPause(vr)
  const gather = vr.gather({
    numDigits: 1,
    action: voiceResponseUrl({
      callJobId: params.callJobId,
      step: 'menu',
      reason: params.reason,
      mode: 'dtmf',
      ...(params.state ? { state: params.state } : {}),
    }),
    method: 'POST',
    timeout: 10,
  })
  slowSay(gather, script.mainMenu(params.ctx))
  slowSay(vr, 'We did not receive a selection. Goodbye.')
  return vr.toString()
}

export function buildDtmfClosingTwiml(params: {
  reason: CallReason
  closingMessage: string
  action: 'complete' | 'transfer' | 'callback'
}): string {
  const vr = new twilio.twiml.VoiceResponse()

  startAfterPause(vr)
  slowSay(vr, params.closingMessage)
  if (params.action === 'transfer') {
    if (config.staffPhone) {
      slowSay(vr, 'Connecting you to our pharmacy team.')
      vr.dial(config.staffPhone)
    } else {
      slowSay(vr, 'Please call the pharmacy during business hours.')
    }
  }
  return vr.toString()
}

export function buildDtmfDobRetryTwiml(params: {
  callJobId: string
  reason: CallReason
  state?: string
}): string {
  const vr = new twilio.twiml.VoiceResponse()
  const script = getCallScript(params.reason)

  startAfterPause(vr)
  slowSay(vr, 'Sorry, that date of birth did not match our records.')
  const gather = vr.gather({
    numDigits: 4,
    action: voiceResponseUrl({
      callJobId: params.callJobId,
      step: 'dob',
      reason: params.reason,
      mode: 'dtmf',
      ...(params.state ? { state: params.state } : {}),
    }),
    method: 'POST',
    timeout: 10,
  })
  slowSay(gather, 'Please try again. ' + script.dobPrompt)
  slowSay(vr, 'We could not verify your identity. Goodbye.')
  return vr.toString()
}

export function buildVoicemailTwiml(reason: CallReason, ctx: ScriptContext): string {
  const vr = new twilio.twiml.VoiceResponse()
  const script = getCallScript(reason)
  startAfterPause(vr)
  slowSay(vr, fillTemplate(script.voicemail, ctx) || safeVoicemailMessage(config.pharmacyName))
  return vr.toString()
}

export function buildTransferTwiml(): string {
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  if (config.staffPhone) {
    slowSay(vr, 'Connecting you to our pharmacy team.')
    vr.dial(config.staffPhone)
  } else {
    slowSay(vr, 'Please call the pharmacy during business hours.')
  }
  return vr.toString()
}

export function buildAiGatherTwiml(params: {
  callJobId: string
  reason: CallReason
  spoken: string
  step?: 'greeting' | 'ai'
  state?: string
}): string {
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  slowSay(vr, params.spoken)
  const gather = vr.gather({
    input: ['speech'],
    speechTimeout: 'auto',
    action: voiceResponseUrl({
      callJobId: params.callJobId,
      step: params.step === 'greeting' ? 'ai' : 'ai',
      reason: params.reason,
      mode: 'ai',
      ...(params.state ? { state: params.state } : {}),
    }),
    method: 'POST',
    timeout: 8,
  })
  slowSay(gather, ' ')
  slowSay(vr, 'We did not hear a response. Goodbye.')
  return vr.toString()
}

export function buildAiClosingTwiml(spoken: string, action: 'complete' | 'transfer' | 'callback'): string {
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  slowSay(vr, spoken)
  if (action === 'transfer') {
    if (config.staffPhone) {
      slowSay(vr, 'Connecting you to our pharmacy team.')
      vr.dial(config.staffPhone)
    } else {
      slowSay(vr, 'Please call the pharmacy during business hours.')
    }
  }
  return vr.toString()
}

export function buildAiGreetingTwiml(params: {
  callJobId: string
  reason: CallReason
  ctx: ScriptContext
  state?: string
}): string {
  const script = getCallScript(params.reason)
  const spoken =
    fillTemplate(script.greeting, params.ctx) + ' ' + script.dobPrompt
  return buildAiGatherTwiml({
    callJobId: params.callJobId,
    reason: params.reason,
    spoken,
    step: 'greeting',
    state: params.state,
  })
}

export function verifyDob(dobInput: string, jobDob: string): boolean {
  const digits = dobInput.replace(/\D/g, '')
  const jobDigits = jobDob.replace(/\D/g, '')
  if (digits.length < 4 || jobDigits.length < 4) return false

  const expectedValues = new Set<string>()

  const dateParts = jobDob.match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})/)
  if (dateParts) {
    const first = dateParts[1]!
    const second = dateParts[2]!
    const third = dateParts[3]!
    const yearFirst = first.length === 4
    const month = (yearFirst ? second : first).padStart(2, '0')
    const day = (yearFirst ? third : second).padStart(2, '0')
    const year = (yearFirst ? first : third).padStart(4, '0')
    expectedValues.add(`${month}${day}`)
    expectedValues.add(`${month}${day}${year}`)
    expectedValues.add(`${year}${month}${day}`)
    expectedValues.add(year.slice(-4))
  }

  if (jobDigits.length >= 8) {
    expectedValues.add(jobDigits.slice(0, 4))
    expectedValues.add(jobDigits.slice(-4))
    expectedValues.add(jobDigits)
  }

  return expectedValues.has(digits)
}

export function resolveMenuSelection(reason: CallReason, digit: string) {
  const script = getCallScript(reason)
  return resolveResponseOption(script, digit)
}

export function buildInboundTwiml(): string {
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  slowSay(vr, `Thank you for calling ${config.pharmacyName}.`)
  const gather = vr.gather({
    numDigits: 1,
    action: voiceResponseUrl({ flow: 'inbound' }),
    method: 'POST',
    timeout: 6,
  })
  slowSay(
    gather,
    'Press 1 for refill, 2 for prescription status, 3 for delivery, 4 for store hours, or 0 for staff.',
  )
  slowSay(vr, 'Goodbye.')
  return vr.toString()
}

export function buildInboundAckTwiml(): string {
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  slowSay(vr, 'Thank you. We have noted your request. Goodbye.')
  return vr.toString()
}
