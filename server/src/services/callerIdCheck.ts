import { getTwilioClient } from '../lib/twilioAuth.js'
import { config } from '../config.js'
import { normalizePhone } from './safety.js'

export type CallerIdType = 'owned_number' | 'verified_caller_id' | 'not_found' | 'unknown'

export interface CallerIdStatus {
  number: string
  usable: boolean
  type: CallerIdType
  message: string
}

// Module-level cache — avoids hammering Twilio on every health poll.
// Invalidated when the cached number no longer matches the configured number.
let _cache: { number: string; result: CallerIdStatus; expiresAt: number } | null = null
const CACHE_TTL_MS = 120_000

export function invalidateCallerIdCache(): void {
  _cache = null
}

export async function checkCallerIdStatus(
  rawNumber?: string,
  { bypassCache = false } = {},
): Promise<CallerIdStatus> {
  const target = rawNumber ?? config.twilioPhoneNumber
  const number = normalizePhone(target) ?? target.trim()

  if (!number) {
    return {
      number: '',
      usable: false,
      type: 'not_found',
      message: 'No outbound caller ID configured. Enter a phone number in Settings.',
    }
  }

  if (!number.startsWith('+')) {
    return {
      number,
      usable: false,
      type: 'not_found',
      message: 'Phone numbers must be in +1XXXXXXXXXX format.',
    }
  }

  // Return cached result when checking the same number
  if (!bypassCache && _cache && _cache.number === number && _cache.expiresAt > Date.now()) {
    return _cache.result
  }

  const client = getTwilioClient()
  if (!client) {
    return {
      number,
      usable: false,
      type: 'unknown',
      message: 'Calling service is not connected. Check credentials in Settings.',
    }
  }

  try {
    const owned = await client.incomingPhoneNumbers.list({ phoneNumber: number, limit: 1 })
    if (owned.length > 0) {
      const result: CallerIdStatus = {
        number,
        usable: true,
        type: 'owned_number',
        message: 'This number is owned by your account and ready for live calls.',
      }
      _cache = { number, result, expiresAt: Date.now() + CACHE_TTL_MS }
      return result
    }

    const verified = await client.outgoingCallerIds.list({ phoneNumber: number, limit: 1 })
    if (verified.length > 0) {
      const result: CallerIdStatus = {
        number,
        usable: true,
        type: 'verified_caller_id',
        message: 'This is a verified caller ID and ready for live calls.',
      }
      _cache = { number, result, expiresAt: Date.now() + CACHE_TTL_MS }
      return result
    }

    const result: CallerIdStatus = {
      number,
      usable: false,
      type: 'not_found',
      message:
        'Outbound caller ID is not verified or owned by this Twilio account. ' +
        'Buy the number in Twilio Console or add it as a verified caller ID.',
    }
    _cache = { number, result, expiresAt: Date.now() + CACHE_TTL_MS }
    return result
  } catch {
    // Don't cache transient errors
    return {
      number,
      usable: false,
      type: 'unknown',
      message: 'Could not verify caller ID right now. Twilio may be temporarily unavailable.',
    }
  }
}

/**
 * Throws if the configured caller ID is not usable for live calls.
 * Safe to call in test mode (skip check) or when Twilio is not configured (skip check).
 */
export async function assertCallerIdUsable(): Promise<void> {
  if (config.autoCallTestMode) return
  if (!getTwilioClient()) return // Twilio not configured — let startOutboundCall handle it

  const status = await checkCallerIdStatus()
  if (!status.usable) {
    throw new Error(
      `Outbound caller ID ${status.number} is not verified or owned by this Twilio account. ` +
      `Go to Settings to fix this before starting live calls.`,
    )
  }
}
