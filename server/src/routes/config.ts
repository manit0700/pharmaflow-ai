import { Router } from 'express'
import { config, updateConfig } from '../config.js'
import { phoneProvider } from '../services/phoneProvider.js'
import { checkCallerIdStatus, invalidateCallerIdCache } from '../services/callerIdCheck.js'
import { getTwilioClient } from '../lib/twilioAuth.js'

export const configRouter = Router()

configRouter.get('/config', (_req, res) => {
  res.json({
    twilioPhoneNumber: config.twilioPhoneNumber,
    staffPhone: config.staffPhone,
    pharmacyName: config.pharmacyName,
    callMode: config.callMode,
    twilioVoice: config.twilioVoice,
    twilioLanguage: config.twilioLanguage,
    enableSmsFollowup: config.enableSmsFollowup,
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
  const provider = phoneProvider.displayName
  const carrier = phoneProvider.carrierName

  // bypassCache when the caller explicitly requests a specific number (Settings page "Check" button)
  const bypassCache = Boolean(requestedNumber)
  const result = await checkCallerIdStatus(requestedNumber || undefined, { bypassCache })

  res.json({
    number: result.number,
    provider,
    carrier,
    usable: result.usable,
    type: result.type,
    message: result.message,
  } satisfies CallerIdStatusResponse)
})

const E164 = /^\+[1-9]\d{1,14}$/

configRouter.post('/config/caller-id-verify', async (req, res) => {
  const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : ''
  if (!E164.test(phoneNumber)) {
    res.status(400).json({ error: 'Phone number must be in E.164 format, e.g. +16825551234.' })
    return
  }

  const client = getTwilioClient()
  if (!client) {
    res.status(400).json({ error: 'Twilio is not configured. Add your account credentials in the environment first.' })
    return
  }

  try {
    const request = await client.validationRequests.create({ phoneNumber, friendlyName: 'Pharmacy caller ID' })
    res.json({
      validationCode: request.validationCode,
      callSid: request.callSid,
      phoneNumber: request.phoneNumber,
    })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not start caller ID verification.' })
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
    if ('twilioPhoneNumber' in patches) invalidateCallerIdCache()
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
        enableSmsFollowup: config.enableSmsFollowup,
      },
    })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Config update failed' })
  }
})
