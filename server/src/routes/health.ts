import { Router } from 'express'
import { fetchTwilioAccountSummary } from '../lib/twilioAuth.js'
import { config } from '../config.js'
import { isAiCallConfigured } from '../services/callAi.js'
import { getLiveCallReadiness, getTwilioAuthMode, isTwilioConfigured } from '../services/twilio.js'

export const healthRouter = Router()

const serverBootedAt = new Date().toISOString()

function databaseHealth() {
  const databaseUrl = process.env.DATABASE_URL ?? ''
  const provider = /^postgres(?:ql)?:\/\//i.test(databaseUrl)
    ? 'postgres'
    : databaseUrl.startsWith('file:')
      ? 'sqlite'
      : databaseUrl
        ? 'unknown'
        : 'missing'
  const durable = provider === 'postgres'
  const warning =
    process.env.VERCEL === '1' && provider === 'sqlite'
      ? 'Vercel SQLite uses temporary storage. Use a Postgres DATABASE_URL for reliable call status updates.'
      : null

  return { provider, durable, warning }
}

healthRouter.get('/health', async (_req, res) => {
  const twilioAccount = isTwilioConfigured() ? await fetchTwilioAccountSummary() : null

  res.json({
    ok: true,
    service: 'pharmaflow-ai-server',
    configSource: config.configSource,
    apiVersion: 2,
    callMode: config.callMode,
    aiCallConfigured: config.callMode === 'ai' ? isAiCallConfigured() : null,
    callAiModel: config.callMode === 'ai' ? config.callAiModel : null,
    features: {
      createCallJob: true,
      simulatedCalls: config.autoCallTestMode,
      dtmfScripts: true,
      aiConversation: config.callMode === 'ai',
    },
    twilioConfigured: isTwilioConfigured(),
    twilioAuthMode: getTwilioAuthMode(),
    twilioAccount,
    twilioFromNumber: config.twilioPhoneNumber,
    testMode: config.autoCallTestMode,
    liveCallReadiness: getLiveCallReadiness(),
    publicBaseUrl: config.publicBaseUrl,
    database: databaseHealth(),
    port: config.port,
    serverBootedAt,
  })
})
