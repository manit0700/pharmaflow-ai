import type { CallReason } from '../config.js'

export interface Prescription {
  name: string
  cost: number
}

export interface ScriptContext {
  pharmacyName: string
  patientName: string
  staffPhone?: string
  patientDob?: string
  medicationName: string
  prescriptions?: Prescription[]
  prescriptionCost?: number
}

export type ResponseAction = 'complete' | 'transfer' | 'callback'

export interface ResponseOption {
  digit: string
  label: string
  patientResponse: string
  action: ResponseAction
}

export interface CallScript {
  callReason: CallReason
  title: string
  greeting: string
  dobPrompt: string
  mainMenu: (ctx: ScriptContext) => string
  closing: (option: ResponseOption) => string
  voicemail: string
  options: ResponseOption[]
}

export const CALL_SCRIPT_CATALOG: Record<CallReason, CallScript> = {
  refill_reminder: {
    callReason: 'refill_reminder',
    title: 'Refill reminder',
    greeting: 'Hello, this is {pharmacy} calling with a refill reminder for {patient}.',
    dobPrompt:
      'For your privacy, please enter the four digits of your date of birth, month and day. For example, March 5th is 0 3 0 5.',
    mainMenu: (ctx) => {
      const names = rxListText(ctx)
      const costLine = ctx.prescriptionCost
        ? ` Your total amount due is $${ctx.prescriptionCost.toFixed(2)}.`
        : ''
      return `Thank you. We are reaching out about a refill for ${names} that may be due.${costLine} ` +
        'Press 1 if you would like us to process your refill today. ' +
        'Press 2 if you are not ready yet. ' +
        'Press 3 if you already picked up or do not need a refill. ' +
        'Press 0 to speak with our pharmacy team.'
    },
    closing: (opt) => {
      if (opt.digit === '1') return 'Great, we will process your refill and notify you when it is ready. Thank you.'
      if (opt.digit === '2') return 'No problem. We will follow up again later. Thank you.'
      if (opt.digit === '3') return 'Thank you for letting us know.'
      return 'Thank you.'
    },
    voicemail: 'Hello {patient}, this is {pharmacy} calling about a prescription refill. Please call us back at your earliest convenience. To reach us directly, call {staffPhone}. Thank you.',
    options: [
      { digit: '1', label: 'Process refill today', patientResponse: 'Confirmed refill — process today', action: 'complete' },
      { digit: '2', label: 'Not ready yet', patientResponse: 'Not ready for refill yet', action: 'complete' },
      { digit: '3', label: 'Already picked up / not needed', patientResponse: 'Already picked up or refill not needed', action: 'complete' },
      { digit: '0', label: 'Speak with staff', patientResponse: 'Requested pharmacist', action: 'transfer' },
    ],
  },

  pickup_reminder: {
    callReason: 'pickup_reminder',
    title: 'Pickup reminder',
    greeting: 'Hello, this is {pharmacy} calling with a pickup reminder for {patient}.',
    dobPrompt:
      'For your privacy, please enter the four digits of your date of birth, month and day.',
    mainMenu: (ctx) => {
      const names = rxListText(ctx)
      const costLine = ctx.prescriptionCost
        ? ` Your total amount due is $${ctx.prescriptionCost.toFixed(2)}.`
        : ''
      return `Thank you. Your prescription for ${names} is ready for pickup at the pharmacy.${costLine} ` +
        'Press 1 if you plan to pick it up today. ' +
        'Press 2 if you need more time. ' +
        'Press 3 if you already picked it up. ' +
        'Press 0 to speak with our pharmacy team.'
    },
    closing: (opt) => {
      if (opt.digit === '1') return 'Wonderful, we will have it ready for you. Thank you.'
      if (opt.digit === '2') return 'Understood. We will hold your prescription. Thank you.'
      if (opt.digit === '3') return 'Thank you for confirming.'
      return 'Thank you.'
    },
    voicemail: 'Hello {patient}, this is {pharmacy} calling about a prescription ready for pickup. Please call us back at your earliest convenience. To reach us directly, call {staffPhone}. Thank you.',
    options: [
      { digit: '1', label: 'Picking up today', patientResponse: 'Will pick up today', action: 'complete' },
      { digit: '2', label: 'Needs more time', patientResponse: 'Needs more time before pickup', action: 'complete' },
      { digit: '3', label: 'Already picked up', patientResponse: 'Already picked up prescription', action: 'complete' },
      { digit: '0', label: 'Speak with staff', patientResponse: 'Requested pharmacist', action: 'transfer' },
    ],
  },

  delivery_update: {
    callReason: 'delivery_update',
    title: 'Delivery update',
    greeting: 'Hello, this is {pharmacy} calling with a delivery update for {patient}.',
    dobPrompt:
      'For your privacy, please enter the four digits of your date of birth, month and day.',
    mainMenu: () =>
      'We have an update about your prescription delivery. ' +
      'Press 1 if you will be available to receive delivery today. ' +
      'Press 2 if you need to reschedule delivery. ' +
      'Press 3 if you already received your delivery. ' +
      'Press 0 to speak with our pharmacy team.',
    closing: (opt) => {
      if (opt.digit === '1') return 'Thank you. We will proceed with delivery as planned.'
      if (opt.digit === '2') return 'We will have our team contact you to reschedule.'
      if (opt.digit === '3') return 'Thank you for confirming.'
      return 'Thank you.'
    },
    voicemail: 'Hello {patient}, this is {pharmacy} calling about your prescription delivery. Please call us back at your earliest convenience. To reach us directly, call {staffPhone}. Thank you.',
    options: [
      { digit: '1', label: 'Available for delivery', patientResponse: 'Available for delivery today', action: 'complete' },
      { digit: '2', label: 'Reschedule delivery', patientResponse: 'Requested delivery reschedule', action: 'transfer' },
      { digit: '3', label: 'Already received', patientResponse: 'Already received delivery', action: 'complete' },
      { digit: '0', label: 'Speak with staff', patientResponse: 'Requested pharmacist', action: 'transfer' },
    ],
  },

  insurance_update: {
    callReason: 'insurance_update',
    title: 'Insurance update',
    greeting: 'Hello, this is {pharmacy} calling about an insurance update for {patient}.',
    dobPrompt:
      'For your privacy, please enter the four digits of your date of birth, month and day.',
    mainMenu: () =>
      'We need to discuss an insurance-related update with our pharmacy team. ' +
      'Press 1 if you are available to talk now. ' +
      'Press 2 to request a callback from our staff. ' +
      'Press 0 to connect with a team member now.',
    closing: (opt) => {
      if (opt.digit === '1') return 'Please hold while we connect you.'
      if (opt.digit === '2') return 'Our team will call you back shortly. Thank you.'
      return 'Thank you.'
    },
    voicemail: 'Hello {patient}, this is {pharmacy} calling about an insurance update for your prescription. Please call us back at your earliest convenience. To reach us directly, call {staffPhone}. Thank you.',
    options: [
      { digit: '1', label: 'Available now', patientResponse: 'Available to discuss insurance', action: 'transfer' },
      { digit: '2', label: 'Request callback', patientResponse: 'Requested insurance callback', action: 'callback' },
      { digit: '0', label: 'Speak with staff', patientResponse: 'Requested pharmacist — insurance', action: 'transfer' },
    ],
  },

  general_callback: {
    callReason: 'general_callback',
    title: 'General callback',
    greeting: 'Hello, this is {pharmacy} following up on a prescription matter for {patient}.',
    dobPrompt:
      'For your privacy, please enter the four digits of your date of birth, month and day.',
    mainMenu: () =>
      'We are following up on a prescription matter. ' +
      'Press 1 if this is a good time to talk. ' +
      'Press 2 if you would like us to call back later. ' +
      'Press 3 if your question is already resolved. ' +
      'Press 0 to speak with our pharmacy team.',
    closing: (opt) => {
      if (opt.digit === '1') return 'Thank you. A team member will assist you shortly.'
      if (opt.digit === '2') return 'We will call you back at a better time. Thank you.'
      if (opt.digit === '3') return 'Glad to hear it is resolved. Thank you.'
      return 'Thank you.'
    },
    voicemail: 'Hello {patient}, this is {pharmacy} following up on a prescription matter. Please call us back at your earliest convenience. To reach us directly, call {staffPhone}. Thank you.',
    options: [
      { digit: '1', label: 'Good time to talk', patientResponse: 'Available to talk now', action: 'transfer' },
      { digit: '2', label: 'Call back later', patientResponse: 'Requested callback later', action: 'callback' },
      { digit: '3', label: 'Already resolved', patientResponse: 'Issue already resolved', action: 'complete' },
      { digit: '0', label: 'Speak with staff', patientResponse: 'Requested pharmacist', action: 'transfer' },
    ],
  },
}

export function getCallScript(reason: CallReason): CallScript {
  return CALL_SCRIPT_CATALOG[reason] ?? CALL_SCRIPT_CATALOG.general_callback
}

export function rxListText(ctx: ScriptContext): string {
  if (ctx.prescriptions && ctx.prescriptions.length > 1) {
    const names = ctx.prescriptions.map((p) => p.name)
    const last = names.pop()!
    return names.length === 1 ? `${names[0]} and ${last}` : `${names.join(', ')}, and ${last}`
  }
  return ctx.medicationName || 'your medication'
}

export function fillTemplate(text: string, ctx: ScriptContext): string {
  return text
    .replace(/\{pharmacy\}/g, ctx.pharmacyName)
    .replace(/\{patient\}/g, ctx.patientName)
    .replace(/\s*To reach us directly, call \{staffPhone\}\./g, ctx.staffPhone ? ` To reach us directly, call ${ctx.staffPhone}.` : '')
    .replace(/\{staffPhone\}/g, ctx.staffPhone ?? '')
    .replace(/\{medication\}/g, ctx.medicationName || 'your medication')
}

export function resolveResponseOption(script: CallScript, digit: string): ResponseOption | undefined {
  return script.options.find((o) => o.digit === digit)
}

export function formatScriptForPreview(reason: CallReason, ctx: ScriptContext): string {
  const script = getCallScript(reason)
  const lines: string[] = [
    `=== ${script.title} (${reason}) ===`,
    '',
    'STEP 1 — Greeting',
    fillTemplate(script.greeting, ctx),
    '',
    'STEP 2 — DOB verification (patient enters 4 digits)',
    script.dobPrompt,
    '',
    'STEP 3 — Main menu (patient presses 1 key)',
    script.mainMenu(ctx),
    '',
    'ANSWER OPTIONS (stored as patientResponse):',
  ]
  for (const opt of script.options) {
    lines.push(`  [${opt.digit}] ${opt.label} → "${opt.patientResponse}" (${opt.action})`)
    lines.push(`      Closing: ${script.closing(opt)}`)
  }
  lines.push('', 'VOICEMAIL (if no answer)', fillTemplate(script.voicemail, ctx))
  return lines.join('\n')
}
