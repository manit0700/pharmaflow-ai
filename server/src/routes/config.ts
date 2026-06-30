import { Router } from 'express'
import { config, updateConfig } from '../config.js'
import { getTwilioClient } from '../lib/twilioAuth.js'
import { phoneProvider } from '../services/phoneProvider.js'
import { normalizePhone } from '../services/safety.js'

export const configRouter = Router()

configRouter.get('/config', (_req, res) => {
  res.json({
    twilioPhoneNumber: config.twilioPhoneNumber,
    staffPhone: config.staffPhone,
    pharmacyName: config.pharmacyName,
    callMode: config.callMode,
    twilioVoice: config.twilioVoice,
    twilioLanguage: config.twilioLanguage,
    configSource: config.configSource,
  })
})

const ALLOWED = new Set(['twilioPhoneNumber', 'staffPhone', 'pharmacyName', 'callMode', 'twilioVoice', 'twilioLanguage'])

export type CallerIdType = 'owned_number' | 'verified_caller_id' | 'not_found' | 'unknown'

export interface CallerIdStatusResponse {
  number: string
  provider: string
  carrier: string
  usable: boolean
  type: CallerIdType
  message: string
}

configRouter.get('/config/caller-id-status', async (req, res) => {
  const requestedNumber = typeof req.query.number === 'string' ? req.query.number : ''
  const number = requestedNumber ? (normalizePhone(requestedNumber) ?? requestedNumber.trim()) : config.twilioPhoneNumber
  const provider = phoneProvider.displayName
  const carrier = phoneProvider.carrierName

  if (!number) {
    res.json({
      number: '',
      provider,
      carrier,
      usable: false,
      type: 'not_found',
      message: 'No outbound caller ID configured. Enter a phone number in settings.',
    } satisfies CallerIdStatusResponse)
    return
  }

  if (!number.startsWith('+')) {
    res.json({
      number,
      provider,
      carrier,
      usable: false,
      type: 'not_found',
      message: 'Phone numbers must be in +1XXXXXXXXXX format before they can be used for live calls.',
    } satisfies CallerIdStatusResponse)
    return
  }

  const client = getTwilioClient()
  if (!client) {
    res.json({
      number,
      provider,
      carrier,
      usable: false,
      type: 'unknown',
      message: 'Calling service is not connected. Check that your credentials are configured.',
    } satisfies CallerIdStatusResponse)
    return
  }

  try {
    const owned = await client.incomingPhoneNumbers.list({ phoneNumber: number, limit: 1 })
    if (owned.length > 0) {
      res.json({
        number,
        provider,
        carrier,
        usable: true,
        type: 'owned_number',
        message: 'This number is owned by your account and can be used for live calls.',
      } satisfies CallerIdStatusResponse)
      return
    }

    const verified = await client.outgoingCallerIds.list({ phoneNumber: number, limit: 1 })
    if (verified.length > 0) {
      res.json({
        number,
        provider,
        carrier,
        usable: true,
        type: 'verified_caller_id',
        message: 'This number is a verified caller ID and can be used for live calls.',
      } satisfies CallerIdStatusResponse)
      return
    }

    res.json({
      number,
      provider,
      carrier,
      usable: false,
      type: 'not_found',
      message:
        'This number is not ready for outbound calls. To fix this, either buy it from your calling service account or add it as a verified caller ID.',
    } satisfies CallerIdStatusResponse)
  } catch {
    res.json({
      number,
      provider,
      carrier,
      usable: false,
      type: 'unknown',
      message: 'Could not verify this number right now. The calling service may be temporarily unavailable.',
    } satisfies CallerIdStatusResponse)
  }
})

configRouter.patch('/config', (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const patches: Record<string, unknown> = {}
    for (const key of ALLOWED) {
      if (key in body) patches[key] = body[key]
    }
    if (Object.keys(patches).length === 0) {
      res.status(400).json({ error: 'No valid fields provided' })
      return
    }
    updateConfig(patches as Parameters<typeof updateConfig>[0])
    res.json({
      ok: true,
      config: {
        twilioPhoneNumber: config.twilioPhoneNumber,
        staffPhone: config.staffPhone,
        pharmacyName: config.pharmacyName,
        callMode: config.callMode,
        twilioVoice: config.twilioVoice,
        twilioLanguage: config.twilioLanguage,
      },
    })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Config update failed' })
  }
})
