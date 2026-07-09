import fs from 'fs'
import { getConfigSource, loadSettings, localConfigPath } from './loadSettings.js'
import { normalizePhone } from './services/safety.js'

loadSettings()

function e164OrRaw(raw: string): string {
  return normalizePhone(raw) ?? raw.trim()
}

const configSource = getConfigSource()

export const config = {
  configSource,
  port: Number(process.env.PORT ?? 4003),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:4003').replace(/\/$/, ''),
  /** Office/main account SID — must start with AC (not SK) */
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  /** Optional: office API key SID (SK…) + secret (recommended) */
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID ?? '',
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? '',
  /** Legacy: main Auth Token if not using API key */
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioPhoneNumber: e164OrRaw(process.env.TWILIO_PHONE_NUMBER ?? ''),
  /** Separate SMS-capable number. Falls back to twilioPhoneNumber if not set. */
  twilioSmsNumber: e164OrRaw(process.env.TWILIO_SMS_NUMBER ?? process.env.TWILIO_PHONE_NUMBER ?? ''),
  staffPhone: e164OrRaw(process.env.PHARMACY_STAFF_PHONE_NUMBER ?? ''),
  enableSmsFollowup: process.env.ENABLE_SMS_FOLLOWUP === 'true',
  autoCallTestMode: process.env.AUTO_CALL_TEST_MODE === 'true',
  pharmacyName: process.env.PHARMACY_NAME ?? 'Premium Family Pharmacy',
  /** Twilio TTS voice, e.g. Polly.Joanna, Polly.Matthew, Polly.Amy */
  twilioVoice: process.env.TWILIO_VOICE ?? 'Polly.Joanna',
  /** Optional: en-US, en-GB */
  twilioLanguage: process.env.TWILIO_LANGUAGE ?? 'en-US',
  /** Optional: OpenAI for AI-assisted call turns */
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  callAiModel: process.env.CALL_AI_MODEL ?? 'gpt-4o-mini',
  /** Outbound call script mode: dtmf (keypad) or ai (speech + OpenAI) */
  callMode: (process.env.CALL_MODE === 'ai' ? 'ai' : 'dtmf') as 'dtmf' | 'ai',
  /** Optional call safety window (America/Chicago) */
  enforceBusinessHours: process.env.ENFORCE_BUSINESS_HOURS === 'true',
  businessHoursStart: Number(process.env.BUSINESS_HOURS_START ?? 8),
  businessHoursEnd: Number(process.env.BUSINESS_HOURS_END ?? 20),
}

const ENV_KEY_MAP: Record<string, string> = {
  twilioPhoneNumber: 'TWILIO_PHONE_NUMBER',
  staffPhone: 'PHARMACY_STAFF_PHONE_NUMBER',
  pharmacyName: 'PHARMACY_NAME',
  callMode: 'CALL_MODE',
  twilioVoice: 'TWILIO_VOICE',
  twilioLanguage: 'TWILIO_LANGUAGE',
}

type EditableConfig = Pick<typeof config, 'twilioPhoneNumber' | 'staffPhone' | 'pharmacyName' | 'callMode' | 'twilioVoice' | 'twilioLanguage'>

function normalizeEditableConfigPatch(patches: Partial<EditableConfig>): Partial<EditableConfig> {
  const next: Partial<EditableConfig> = {}

  if (patches.twilioPhoneNumber !== undefined) {
    const phone = e164OrRaw(String(patches.twilioPhoneNumber))
    if (!phone || !phone.startsWith('+')) throw new Error('Twilio phone number must be E.164 format, e.g. +12145550100.')
    next.twilioPhoneNumber = phone
  }

  if (patches.staffPhone !== undefined) {
    const raw = String(patches.staffPhone).trim()
    if (!raw) {
      next.staffPhone = ''
    } else {
      const phone = e164OrRaw(raw)
      if (!phone || !phone.startsWith('+')) throw new Error('Staff phone number must be E.164 format, e.g. +12145550100.')
      next.staffPhone = phone
    }
  }

  if (patches.pharmacyName !== undefined) {
    const name = String(patches.pharmacyName).trim()
    if (!name) throw new Error('Pharmacy name is required.')
    next.pharmacyName = name.slice(0, 120)
  }

  if (patches.callMode !== undefined) {
    const mode = String(patches.callMode)
    if (mode !== 'ai' && mode !== 'dtmf') throw new Error('Call mode must be ai or dtmf.')
    next.callMode = mode
  }

  if (patches.twilioVoice !== undefined) {
    const voice = String(patches.twilioVoice).trim()
    if (!voice) throw new Error('Twilio voice is required.')
    next.twilioVoice = voice.slice(0, 80)
  }

  if (patches.twilioLanguage !== undefined) {
    const language = String(patches.twilioLanguage).trim()
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) throw new Error('Twilio language must look like en-US or en-GB.')
    next.twilioLanguage = language
  }

  return next
}

export function updateConfig(patches: Partial<EditableConfig>): void {
  const normalized = normalizeEditableConfigPatch(patches)
  Object.assign(config, normalized)

  for (const [key, value] of Object.entries(normalized)) {
    const envKey = ENV_KEY_MAP[key]
    if (envKey) process.env[envKey] = String(value)
  }

  if (config.configSource === 'local.config.json') {
    try {
      const current = JSON.parse(fs.readFileSync(localConfigPath, 'utf8')) as Record<string, unknown>
      for (const [key, value] of Object.entries(normalized)) {
        const envKey = ENV_KEY_MAP[key]
        if (envKey) current[envKey] = value
      }
      fs.writeFileSync(localConfigPath, `${JSON.stringify(current, null, 2)}\n`)
    } catch (e) {
      throw new Error(`Failed to persist config: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
  }
}

export const VALID_CALL_REASONS = [
  'refill_reminder',
  'pickup_reminder',
  'delivery_update',
  'insurance_update',
  'general_callback',
] as const

export type CallReason = (typeof VALID_CALL_REASONS)[number]
