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

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`
  return null
}
