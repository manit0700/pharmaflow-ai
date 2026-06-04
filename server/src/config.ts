import 'dotenv/config'
import { normalizePhone } from './services/safety.js'

function e164OrRaw(raw: string): string {
  return normalizePhone(raw) ?? raw.trim()
}

export const config = {
  port: Number(process.env.PORT ?? 4002),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:4002').replace(/\/$/, ''),
  /** Office/main account SID — must start with AC (not SK) */
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  /** Optional: office API key SID (SK…) + secret (recommended) */
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID ?? '',
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? '',
  /** Legacy: main Auth Token if not using API key */
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioPhoneNumber: e164OrRaw(process.env.TWILIO_PHONE_NUMBER ?? ''),
  staffPhone: e164OrRaw(process.env.PHARMACY_STAFF_PHONE_NUMBER ?? ''),
  enableSmsFollowup: process.env.ENABLE_SMS_FOLLOWUP === 'true',
  autoCallTestMode: process.env.AUTO_CALL_TEST_MODE !== 'false',
  pharmacyName: process.env.PHARMACY_NAME ?? 'Premium Family Pharmacy',
  /** Twilio TTS voice, e.g. Polly.Joanna, Polly.Matthew, Polly.Amy */
  twilioVoice: process.env.TWILIO_VOICE ?? 'Polly.Joanna',
  /** Optional: en-US, en-GB */
  twilioLanguage: process.env.TWILIO_LANGUAGE ?? 'en-US',
}

export const VALID_CALL_REASONS = [
  'refill_reminder',
  'pickup_reminder',
  'delivery_update',
  'insurance_update',
  'general_callback',
] as const

export type CallReason = (typeof VALID_CALL_REASONS)[number]
