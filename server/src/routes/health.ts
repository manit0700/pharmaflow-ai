import { Router } from 'express'
import { fetchTwilioAccountSummary } from '../lib/twilioAuth.js'
import { config } from '../config.js'
import { ensureRuntimeDb, shouldInitializeRuntimeDb } from '../lib/runtimeDb.js'
import { prisma } from '../lib/prisma.js'
import { isAiCallConfigured } from '../services/callAi.js'
import { getLiveCallReadiness, getTwilioAuthMode, isTwilioConfigured } from '../services/twilio.js'

export const healthRouter = Router()

const serverBootedAt = new Date().toISOString()

async function databaseHealth() {
  const databaseUrl = process.env.DATABASE_URL ?? ''
  const provider = /^postgres(?:ql)?:\/\//i.test(databaseUrl)
    ? 'postgres'
    : databaseUrl.startsWith('file:')
      ? 'sqlite'
      : databaseUrl
        ? 'unknown'
        : 'missing'
  const durable = provider === 'postgres'
  let connected = false
  let error: string | null = null

  if (provider !== 'missing' && provider !== 'unknown') {
    try {
      if (shouldInitializeRuntimeDb()) {
        await ensureRuntimeDb()
      }
      await prisma.$queryRawUnsafe('SELECT 1')
      connected = true
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  let warning: string | null = null
  if (process.env.VERCEL === '1' && provider === 'sqlite') {
    warning = 'Vercel SQLite uses temporary storage. Use a Postgres DATABASE_URL for reliable call status updates.'
  } else if (provider === 'missing') {
    warning = 'DATABASE_URL is missing. Configure Postgres in production before using live calls.'
  } else if (provider === 'unknown') {
    warning = 'DATABASE_URL is set but is not a recognized Postgres or SQLite URL.'
  } else if (provider === 'postgres' && !connected) {
    warning = 'Postgres DATABASE_URL is configured, but the database connection failed.'
  }

  return { provider, durable, connected, warning, error }
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
    database: await databaseHealth(),
    port: config.port,
    serverBootedAt,
  })
})
