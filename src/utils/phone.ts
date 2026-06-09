export function normalizePhoneInput(raw: string): string | null {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (trimmed.startsWith('+') && digits.length >= 10) return `+${digits}`
  return null
}

export function formatPhoneHint(raw: string): string | null {
  const normalized = normalizePhoneInput(raw)
  if (!normalized || !raw.trim()) return null
  return `Will save as ${normalized}`
}
