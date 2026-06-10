import twilio from 'twilio'
import { config } from '../config.js'

export type TwilioAuthMode = 'api_key' | 'auth_token' | 'none'

export function resolveTwilioAuthMode(): TwilioAuthMode {
  const accountSid = config.twilioAccountSid.trim()
  const apiKeySid = config.twilioApiKeySid.trim()
  const apiKeySecret = config.twilioApiKeySecret.trim()
  const authToken = config.twilioAuthToken.trim()

  if (accountSid.startsWith('AC') && apiKeySid.startsWith('SK') && apiKeySecret) {
    return 'api_key'
  }
  if (accountSid.startsWith('AC') && authToken) {
    return 'auth_token'
  }
  return 'none'
}

export function getTwilioClient(): ReturnType<typeof twilio> | null {
  const accountSid = config.twilioAccountSid.trim()
  const apiKeySid = config.twilioApiKeySid.trim()
  const apiKeySecret = config.twilioApiKeySecret.trim()
  const authToken = config.twilioAuthToken.trim()

  if (accountSid.startsWith('AC') && apiKeySid.startsWith('SK') && apiKeySecret) {
    return twilio(apiKeySid, apiKeySecret, { accountSid })
  }
  if (accountSid.startsWith('AC') && authToken) {
    return twilio(accountSid, authToken)
  }
  return null
}

export async function fetchTwilioAccountSummary(): Promise<{
  type: string
  friendlyName: string
  status: string
} | null> {
  const client = getTwilioClient()
  const accountSid = config.twilioAccountSid.trim()
  if (!client || !accountSid.startsWith('AC')) return null

  try {
    const account = await client.api.accounts(accountSid).fetch()
    return {
      type: account.type ?? 'Unknown',
      friendlyName: account.friendlyName ?? '',
      status: account.status ?? 'unknown',
    }
  } catch {
    return null
  }
}

export function getTwilioCredentialIssues(): string[] {
  const issues: string[] = []
  const accountSid = config.twilioAccountSid.trim()
  const apiKeySid = config.twilioApiKeySid.trim()
  const apiKeySecret = config.twilioApiKeySecret.trim()
  const authToken = config.twilioAuthToken.trim()

  if (!accountSid) {
    issues.push('Set TWILIO_ACCOUNT_SID to your office Account SID (starts with AC).')
  } else if (accountSid.startsWith('SK')) {
    issues.push(
      'TWILIO_ACCOUNT_SID must be the Account SID (AC…), not the API Key. Put the SK… value in TWILIO_API_KEY_SID instead.',
    )
  } else if (!accountSid.startsWith('AC')) {
    issues.push('TWILIO_ACCOUNT_SID should start with AC.')
  }

  const hasApiKey = apiKeySid.startsWith('SK') && Boolean(apiKeySecret)
  const hasAuthToken = Boolean(authToken)

  if (!hasApiKey && !hasAuthToken) {
    issues.push(
      'Set either TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (office API key) or TWILIO_AUTH_TOKEN (main auth token).',
    )
  }
  if (apiKeySid && !apiKeySid.startsWith('SK')) {
    issues.push('TWILIO_API_KEY_SID should start with SK.')
  }

  return issues
}
