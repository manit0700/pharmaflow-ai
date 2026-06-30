import { Router } from 'express'
import { config } from '../config.js'
import { prisma } from '../lib/prisma.js'
import { isPostgresDatabaseUrl, resolveDatabaseUrl } from '../lib/databaseUrl.js'
import { isAiCallConfigured } from '../services/callAi.js'
import { getCallbackReadiness } from '../services/callbackUrls.js'
import { phoneProvider } from '../services/phoneProvider.js'
import { checkCallerIdStatus } from '../services/callerIdCheck.js'

export const healthRouter = Router()

const serverBootedAt = new Date().toISOString()

async function getDatabaseHealth() {
  const url = resolveDatabaseUrl()
  const provider = isPostgresDatabaseUrl(url) ? 'postgresql' : url.startsWith('file:') ? 'sqlite-url-configured' : 'unknown'
  try {
    await prisma.$queryRaw`SELECT 1`
    return { connected: true, provider, warning: null }
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : 'Database connection failed'
    return {
      connected: false,
      provider,
      warning:
        provider === 'sqlite-url-configured'
          ? 'Prisma schema uses PostgreSQL, but DATABASE_URL is SQLite-style. Configure a postgres:// or postgresql:// DATABASE_URL.'
          : message,
    }
  }
}

healthRouter.get('/health', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  const [phoneProviderAccount, database, callerIdStatus] = await Promise.all([
    phoneProvider.getAccountSummary(),
    getDatabaseHealth(),
    // Cached (2-min TTL) — safe to call on every health poll without hammering Twilio
    config.autoCallTestMode ? Promise.resolve(null) : checkCallerIdStatus().catch(() => null),
  ])
  const phoneProviderReadiness = phoneProvider.getReadiness()

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
    phoneProvider: {
      id: phoneProvider.id,
      displayName: phoneProvider.displayName,
      carrierName: phoneProvider.carrierName,
      configured: phoneProvider.isConfigured(),
      authMode: phoneProvider.getAuthMode(),
      fromNumber: phoneProvider.getFromNumber(),
      account: phoneProviderAccount,
      readiness: phoneProviderReadiness,
    },
    twilioConfigured: phoneProvider.isConfigured(),
    twilioAuthMode: phoneProvider.getAuthMode(),
    twilioAccount: phoneProviderAccount,
    twilioFromNumber: phoneProvider.getFromNumber(),
    testMode: config.autoCallTestMode,
    liveCallReadiness: phoneProviderReadiness,
    callbacks: getCallbackReadiness(),
    database,
    publicBaseUrl: config.publicBaseUrl,
    port: config.port,
    serverBootedAt,
    callerIdStatus: callerIdStatus
      ? { usable: callerIdStatus.usable, type: callerIdStatus.type, number: callerIdStatus.number, message: callerIdStatus.message }
      : null,
  })
})
