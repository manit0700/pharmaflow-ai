import { config } from '../config.js'
import type { CallReason } from '../config.js'
import {
  getTwilioClient,
  getTwilioCredentialIssues,
  resolveTwilioAuthMode,
} from '../lib/twilioAuth.js'
import { buildInboundTwiml } from './twilioFlow.js'
import { encodeCallbackState } from './callbackState.js'

function getClient() {
  return getTwilioClient()
}

export function isTwilioConfigured(): boolean {
  return getTwilioClient() !== null && Boolean(config.twilioPhoneNumber)
}

export function getTwilioAuthMode(): string {
  return resolveTwilioAuthMode()
}

export interface LiveCallReadiness {
  ready: boolean
  issues: string[]
  publicBaseUrl: string
}

export { buildInboundTwiml } from './twilioFlow.js'

export function getLiveCallReadiness(): LiveCallReadiness {
  const issues: string[] = []
  const base = config.publicBaseUrl

  issues.push(...getTwilioCredentialIssues())
  if (!config.twilioPhoneNumber) {
    issues.push('Set TWILIO_PHONE_NUMBER to your Twilio number in E.164 format, e.g. +12145550100.')
  } else if (!config.twilioPhoneNumber.startsWith('+')) {
    issues.push('TWILIO_PHONE_NUMBER must be E.164 format, e.g. +12145550100.')
  }
  if (!base) {
    issues.push('Set PUBLIC_BASE_URL to your ngrok HTTPS URL before live calls.')
  } else if (/localhost|127\.0\.0\.1/i.test(base)) {
    issues.push(
      'PUBLIC_BASE_URL cannot be localhost for live calls. Run ngrok http 4002, paste the HTTPS URL into server/local.config.json, and restart the API.',
    )
  } else if (!base.startsWith('https://')) {
    issues.push('PUBLIC_BASE_URL must be a public HTTPS URL, for example https://abc123.ngrok-free.app.')
  }
  if (config.callMode === 'ai' && !config.openaiApiKey?.trim()) {
    issues.push('CALL_MODE=ai requires OPENAI_API_KEY in server/local.config.json or server/.env.')
  }

  return { ready: issues.length === 0, issues, publicBaseUrl: base }
}

function assertLiveCallReadiness(): void {
  const readiness = getLiveCallReadiness()
  if (!readiness.ready) {
    throw new Error(readiness.issues.join(' '))
  }
}

function assertPublicWebhookBase(): void {
  const base = config.publicBaseUrl
  if (/localhost|127\.0\.0\.1/i.test(base)) {
    throw new Error(
      'PUBLIC_BASE_URL cannot be localhost — Twilio cannot reach your computer. ' +
        'Run: ngrok http 4002 then set PUBLIC_BASE_URL=https://YOUR-ID.ngrok-free.app in server/local.config.json and restart the API.',
    )
  }
  if (!base.startsWith('https://')) {
    throw new Error(
      'PUBLIC_BASE_URL must be a public HTTPS URL (e.g. ngrok). Twilio webhooks do not work with http://localhost.',
    )
  }
}

function twilioCallErrorMessage(err: unknown): string {
  const maybeTwilio = err as {
    code?: number | string
    status?: number
    message?: string
    moreInfo?: string
  }
  const code = maybeTwilio?.code != null ? String(maybeTwilio.code) : ''
  const status = maybeTwilio?.status != null ? String(maybeTwilio.status) : ''
  const msg = maybeTwilio?.message ?? (err instanceof Error ? err.message : String(err))

  if (code === '21219') {
    return (
      'Twilio trial blocked this call because the patient phone number is not verified. ' +
      'Verify the exact destination number in Twilio Console, or set AUTO_CALL_TEST_MODE=true to simulate calls.'
    )
  }
  if (code === '21211') {
    return 'Twilio rejected the destination phone number. Use E.164 format, for example +12145550101.'
  }
  if (code === '21205' || /not a valid url|url is not a valid url/i.test(msg)) {
    return (
      'Twilio rejected the webhook URL. PUBLIC_BASE_URL must be your current ngrok HTTPS URL, ' +
      'for example https://abc123.ngrok-free.app. Restart the API after changing server/local.config.json.'
    )
  }
  if (/not a valid URL|localhost/i.test(msg)) {
    return (
      'Twilio needs a public HTTPS webhook URL, not localhost. ' +
      'Run ngrok http 4002, copy the https URL into PUBLIC_BASE_URL in server/local.config.json, restart the API.'
    )
  }
  if (status === '403' || msg.includes('403')) {
    return (
      'Twilio rejected the call (403). On trial accounts you can only call verified numbers. ' +
      'Use E.164 format (+1682…) for TWILIO_PHONE_NUMBER, verify the patient number in Twilio Console, ' +
      'or set AUTO_CALL_TEST_MODE=true to simulate calls without Twilio.'
    )
  }
  if (msg.includes('21211') || msg.toLowerCase().includes('invalid')) {
    return `Twilio invalid phone number. Use +1XXXXXXXXXX format. (${msg})`
  }
  return msg || 'Twilio call failed'
}

export async function startOutboundCall(params: {
  to: string
  callJobId: string
  callReason: CallReason
  patientName: string
  dob: string
  medicationName: string
}): Promise<{ sid: string; status: string } | { testMode: true; sid: string }> {
  if (config.autoCallTestMode) {
    return { testMode: true, sid: `TEST_${params.callJobId}_${Date.now()}` }
  }

  const client = getClient()
  if (!client) throw new Error('Twilio is not configured')

  assertLiveCallReadiness()
  assertPublicWebhookBase()

  const initialStep = config.callMode === 'ai' ? 'ai_greeting' : 'greeting'
  const mode = config.callMode
  const urlParams = new URLSearchParams({
    callJobId: params.callJobId,
    step: initialStep,
    reason: params.callReason,
    mode,
    state: encodeCallbackState({
      id: params.callJobId,
      patientName: params.patientName,
      phoneNumber: params.to,
      dob: params.dob,
      medicationName: params.medicationName,
      callReason: params.callReason,
    }),
  })
  const callbackParams = new URLSearchParams({
    callJobId: params.callJobId,
    state: urlParams.get('state') ?? '',
  })

  try {
    const call = await client.calls.create({
      to: params.to,
      from: config.twilioPhoneNumber,
      url: `${config.publicBaseUrl}/api/twilio/voice-response?${urlParams.toString()}`,
      method: 'POST',
      statusCallback: `${config.publicBaseUrl}/api/twilio/status?${callbackParams.toString()}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      machineDetection: 'Enable',
    })
    return { sid: call.sid, status: call.status }
  } catch (err) {
    const error = new Error(twilioCallErrorMessage(err))
    ;(error as Error & { cause?: unknown }).cause = err
    throw error
  }
}
