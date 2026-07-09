// Common phrases spoken by IVR systems and voicemail greetings.
// All lower-case; compared against lower-cased speech input.
// Ordered longest-first so more specific patterns shadow shorter ones.
const IVR_PHRASES = [
  // Voicemail openers
  'you have reached the voicemail',
  'you have reached',
  'you have reached the voice mail',
  'the person you are trying to reach',
  'currently unavailable',
  'is not available',
  'is currently unavailable',

  // Leave-message prompts
  'please leave a message',
  'leave a message',
  'leave your message',
  'leave us a message',
  'please record your message',
  'record your message after the tone',
  'at the tone',
  'after the tone',
  'after the beep',

  // Mailbox states
  'mailbox is full',
  'mailbox',
  'voicemail',

  // Keypad IVR menus
  'press 1',
  'press 2',
  'press 3',
  'press 4',
  'press 0',
  'press one',
  'press two',
  'press three',
  'press zero',
  'press the pound',
  'press the star',
  'for english press',
  'para espanol',
  'to repeat this menu',

  // Hold / queue messages
  'please hold',
  'all of our representatives',
  'all agents are',
  'your estimated wait',
  'your call will be answered',
  'your call is important',
  'your call may be recorded',
  'for quality assurance',
  'thank you for calling',
  'thank you for holding',

  // Emergency / safety prompts
  'if this is an emergency',

  // Carrier / disconnected messages
  'the number you have dialed',
  'cannot be completed as dialed',
  'cannot be completed',
  'has been disconnected',
  'no longer in service',
  'not in service',
  'this number is not',

  // Generic automation markers
  'business hours',
  'automated system',
  'automated message',
]

export function detectNonHumanAudio(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return IVR_PHRASES.some((phrase) => lower.includes(phrase))
}

/** Pharmacy-safe escalation triggers (no clinical advice, no PHI in logs). */
export const ESCALATION_KEYWORDS = [
  'side effect',
  'allerg',
  'emergency',
  'overdose',
  'interaction',
  'pregnant',
  'breastfeed',
  'insurance',
  'copay',
  'prior auth',
  'angry',
  'complaint',
  'lawyer',
  'pharmacist',
  'doctor said',
]

export function needsStaffFollowUp(text: string, callReason: string): { needed: boolean; reason?: string } {
  const lower = text.toLowerCase()
  for (const kw of ESCALATION_KEYWORDS) {
    if (lower.includes(kw)) return { needed: true, reason: `Keyword: ${kw}` }
  }
  if (callReason === 'insurance_update') {
    return { needed: true, reason: 'Insurance update requires staff' }
  }
  return { needed: false }
}

export function safeVoicemailMessage(pharmacyName: string): string {
  return `Hello, this is ${pharmacyName} calling with an important prescription-related update. Please call us back at your earliest convenience. Thank you.`
}

const OPT_OUT_PHRASES = [
  'stop calling',
  'do not call',
  'don\'t call',
  'remove me',
  'take me off',
  'take me off your list',
  'unsubscribe',
  'opt out',
  'no more calls',
  'stop contacting',
  'never call',
  'please stop',
  'stop calling me',
  'remove my number',
  'do not contact',
]

export function isOptOutRequest(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return OPT_OUT_PHRASES.some((phrase) => lower.includes(phrase))
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`
  return null
}
