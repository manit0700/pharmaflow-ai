import { Router } from 'express'
import { fetchTwilioAccountSummary } from '../lib/twilioAuth.js'
import { config } from '../config.js'
import { getLiveCallReadiness, getTwilioAuthMode, isTwilioConfigured } from '../services/twilio.js'

export const healthRouter = Router()

const serverBootedAt = new Date().toISOString()

healthRouter.get('/health', async (_req, res) => {
  const twilioAccount = isTwilioConfigured() ? await fetchTwilioAccountSummary() : null

  res.json({
    ok: true,
    service: 'pharmaflow-ai-server',
    apiVersion: 2,
    features: { createCallJob: true, simulatedCalls: config.autoCallTestMode },
    twilioConfigured: isTwilioConfigured(),
    twilioAuthMode: getTwilioAuthMode(),
    twilioAccount,
    twilioFromNumber: config.twilioPhoneNumber,
    testMode: config.autoCallTestMode,
    liveCallReadiness: getLiveCallReadiness(),
    publicBaseUrl: config.publicBaseUrl,
    port: config.port,
    serverBootedAt,
  })
})
