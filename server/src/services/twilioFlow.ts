import twilio from 'twilio'
import { config, type CallReason } from '../config.js'
import {
  fillTemplate,
  getCallScript,
  resolveResponseOption,
  type ScriptContext,
} from './callScripts.js'
import { safeVoicemailMessage } from './safety.js'

function sayAttrs(): Record<string, string> {
  return { voice: config.twilioVoice }
}

const SAFE_FINAL_ACK = 'Thank you. We have recorded your answer.'
const FAREWELL_PHRASE_RE =
  /\b(?:good[- ]?bye|bye[- ]?bye|bye now|see you(?: later| soon)?|talk (?:to you )?soon|take care(?: now)?|farewell|so long|cheers|until next time|all the best|best wishes|best of luck|have a (?:nice|great|good|wonderful|blessed) (?:day|evening|night|one)|good night|good evening)\b[,.! ]*/gi
const FAREWELL_WORD_RE =
  /\b(?:goodbye|bye|farewell|take care|see you|nice day|great day|good day|wonderful day|best wishes|good night|good evening)\b/i

function sanitizeSpokenText(text: string): string {
  const cleaned = text
    .replace(FAREWELL_PHRASE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()

  if (!cleaned || FAREWELL_WORD_RE.test(cleaned)) return SAFE_FINAL_ACK
  return cleaned
}

type TwimlSayNode = {
  say: (attrs: ReturnType<typeof sayAttrs>, message: string) => void
}

function slowSay(node: TwimlSayNode, text: string): void {
  node.say(sayAttrs(), sanitizeSpokenText(text))
}

function startAfterPause(vr: twilio.twiml.VoiceResponse): void {
  vr.pause({ length: 0.5 })
}

function voiceResponseUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params)
  return `${config.publicBaseUrl}/api/twilio/voice-response?${qs.toString()}`
}

export function scriptContextFromJob(job: {
  patientName: string
  dob?: string
  medicationName: string
  prescriptionCost?: number | null
  prescriptionsJson?: string | null
}): ScriptContext {
  let prescriptions: ScriptContext['prescriptions']
  if (job.prescriptionsJson) {
    try {
      prescriptions = JSON.parse(job.prescriptionsJson) as ScriptContext['prescriptions']
    } catch { /* ignore */ }
  }
  return {
    pharmacyName: config.pharmacyName,
    patientName: job.patientName,
    staffPhone: config.staffPhone || undefined,
    patientDob: job.dob ?? undefined,
    medicationName: job.medicationName,
    prescriptions,
    prescriptionCost: job.prescriptionCost ?? undefined,
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
  vr.hangup()
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
  vr.hangup()
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
      vr.hangup()
    }
  } else {
    vr.hangup()
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
  vr.hangup()
  return vr.toString()
}

export function buildVoicemailTwiml(reason: CallReason, ctx: ScriptContext): string {
  const vr = new twilio.twiml.VoiceResponse()
  const script = getCallScript(reason)
  startAfterPause(vr)
  slowSay(vr, fillTemplate(script.voicemail, ctx) || safeVoicemailMessage(config.pharmacyName))
  vr.hangup()
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
    vr.hangup()
  }
  return vr.toString()
}

export function buildAiGatherTwiml(params: {
  callJobId: string
  reason: CallReason
  spoken: string
  step?: 'greeting' | 'ai' | 'availability'
  state?: string
}): string {
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  const expectingDob = params.step === 'greeting'
  // Twilio hints max = 500 chars. Keep these tight.
  // DOB: digits + month names only (~200 chars)
  const dobHints =
    'zero, one, two, three, four, five, six, seven, eight, nine, ' +
    'January, February, March, April, May, June, July, August, September, October, November, December, ' +
    'first, second, third, fourth, fifth, tenth, twentieth, thirtieth'
  // Yes/no: keep under 500 chars (~320 chars)
  const answerHints =
    'yes, yeah, yep, yup, sure, okay, ok, alright, please, go ahead, process it, sounds good, of course, absolutely, definitely, correct, right, ' +
    'no, nope, nah, not yet, not now, not today, already got it, maybe later, skip it, negative'

  const availabilityHints =
    'yes, yeah, sure, ok, okay, go ahead, now is fine, available, ' +
    'no, not now, not available, busy, call back, call me later, bad time'

  const gatherAttrs = {
    // Both DOB and conversation turns accept speech + dtmf so keypad is always a fallback.
    // DOB: numDigits=4 so pressing MMDD submits immediately (no # needed, no 15s wait).
    // Conversation: numDigits=1 so a single keypress is accepted immediately.
    // numDigits does NOT suppress speech — if the caller speaks first, STT still runs.
    input: ['speech', 'dtmf'] as ('speech' | 'dtmf')[],
    ...(expectingDob ? { numDigits: 4 } : { numDigits: 1 }),
    // 1s silence after patient stops talking — sufficient for short DOB/yes/no phrases.
    speechTimeout: '1' as const,
    language: 'en-US' as const,
    // No speechModel — default avoids requiring the Voice Intelligence add-on
    hints: expectingDob
      ? dobHints
      : params.step === 'availability'
        ? availabilityHints
        : answerHints,
    action: voiceResponseUrl({
      callJobId: params.callJobId,
      step: params.step ?? 'ai',
      reason: params.reason,
      mode: 'ai',
      ...(params.state ? { state: params.state } : {}),
    }),
    method: 'POST' as const,
    timeout: 15,
  }

  // Always put <Say> inside <Gather> so Twilio manages TTS/STT separation.
  // Previously, <Say> outside <Gather> left an audio tail that triggered VAD
  // and caused the Gather to submit with an empty SpeechResult before the
  // patient could speak.
  const gather = vr.gather(gatherAttrs)
  slowSay(gather, params.spoken)

  vr.hangup()
  return vr.toString()
}

export function buildAiDobRetryTwiml(params: {
  callJobId: string
  reason: CallReason
  state?: string
}): string {
  return buildAiGatherTwiml({
    callJobId: params.callJobId,
    reason: params.reason,
    spoken: 'Sorry, I did not catch the date of birth clearly. Please say the month and day again, for example January first.',
    step: 'greeting',
    state: params.state,
  })
}

export function buildAiPostDobPrompt(params: {
  callJobId: string
  reason: CallReason
  ctx: ScriptContext
  state?: string
}): string {
  const names =
    params.ctx.prescriptions && params.ctx.prescriptions.length > 1
      ? params.ctx.prescriptions.map((p) => p.name).join(', ')
      : params.ctx.medicationName || 'your prescription'
  const costLine = params.ctx.prescriptionCost
    ? ` Your total amount due is $${params.ctx.prescriptionCost.toFixed(2)}.`
    : ''
  const promptByReason: Record<CallReason, string> = {
    refill_reminder: `Thank you. We are reaching out about a refill for ${names} that may be due.${costLine} Would you like us to process that refill today?`,
    pickup_reminder: `Thank you. Your prescription for ${names} is ready for pickup at the pharmacy.${costLine} Do you plan to pick it up today?`,
    delivery_update: 'Thank you. We have an update about your prescription delivery. Are you available to receive delivery today?',
    insurance_update: 'Thank you. We have an insurance-related pharmacy update. Would you like to speak with our pharmacy team about it?',
    general_callback: 'Thank you. We are following up on a prescription matter. Is this a good time to talk?',
  }

  return buildAiGatherTwiml({
    callJobId: params.callJobId,
    reason: params.reason,
    spoken: promptByReason[params.reason] ?? promptByReason.general_callback,
    step: 'ai',
    state: params.state,
  })
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
      vr.hangup()
    }
  } else {
    vr.hangup()
  }
  return vr.toString()
}

/**
 * First step: introduce the pharmacy and reason for calling, then ask if
 * the patient is available. DOB is NOT requested here — only after they confirm.
 */
export function buildAiGreetingTwiml(params: {
  callJobId: string
  reason: CallReason
  ctx: ScriptContext
  state?: string
}): string {
  const script = getCallScript(params.reason)
  const intro = fillTemplate(script.greeting, params.ctx)
  const spoken = `${intro} Are you available to speak for a moment?`
  return buildAiGatherTwiml({
    callJobId: params.callJobId,
    reason: params.reason,
    spoken,
    step: 'availability',
    state: params.state,
  })
}

/**
 * After the patient confirms availability: ask for DOB to verify identity.
 */
export function buildAiDobGatherTwiml(params: {
  callJobId: string
  reason: CallReason
  state?: string
}): string {
  return buildAiGatherTwiml({
    callJobId: params.callJobId,
    reason: params.reason,
    spoken: 'To keep your information safe, please say your date of birth, or press the month and day on your keypad.',
    step: 'greeting',
    state: params.state,
  })
}

export { verifyDob } from './dob.js'

export function resolveMenuSelection(reason: CallReason, digit: string) {
  const script = getCallScript(reason)
  return resolveResponseOption(script, digit)
}

export function buildInboundTwiml(): string {
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  if (config.staffPhone) {
    const gather = vr.gather({
      numDigits: 1,
      action: voiceResponseUrl({ flow: 'inbound' }),
      method: 'POST',
      timeout: 6,
    })
    slowSay(
      gather,
      `Thank you for calling ${config.pharmacyName}. This line handles prescription refill reminders. Press 1 to speak with our pharmacy team.`,
    )
  } else {
    slowSay(
      vr,
      `Thank you for calling ${config.pharmacyName}. This line handles prescription refill reminders. For immediate assistance, please hold or call back during business hours.`,
    )
  }
  vr.hangup()
  return vr.toString()
}

/**
 * Served when an inbound caller's number matches a recent outbound voicemail/callback job.
 * Tells them why we called and asks if they want to speak with staff.
 */
export function buildCallbackMatchTwiml(params: {
  callJobId: string
  reason: CallReason
  ctx: ScriptContext
}): string {
  const script = getCallScript(params.reason)
  const reasonPhrase = fillTemplate(script.greeting, params.ctx)
    .replace(/^Hello[^,]*,\s*/i, '')
    .replace(/\.$/, '')
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  const gather = vr.gather({
    numDigits: 1,
    action: voiceResponseUrl({ flow: 'callback_return', callJobId: params.callJobId, reason: params.reason }),
    method: 'POST',
    timeout: 8,
  })
  slowSay(
    gather,
    `Thank you for calling back ${config.pharmacyName}. We recently tried to reach you regarding ${reasonPhrase}. Press 1 to speak with our pharmacy team, or press 2 to leave a message.`,
  )
  vr.hangup()
  return vr.toString()
}

export function buildInboundAckTwiml(): string {
  const vr = new twilio.twiml.VoiceResponse()
  startAfterPause(vr)
  slowSay(vr, 'Thank you. We have noted your request.')
  vr.hangup()
  return vr.toString()
}
