import { useCallback, useEffect, useState } from 'react'
import { fetchHealth, type HealthResponse } from '@/utils/api'
import type { IntegrationStatus } from '@/types'

function buildIntegrations(health: HealthResponse | null): IntegrationStatus[] {
  const now = new Date().toISOString()
  const twilioOk = Boolean(health?.twilioConfigured)
  const aiOk = health?.callMode !== 'ai' || health.aiCallConfigured === true
  const liveReady = Boolean(health?.testMode || health?.liveCallReadiness?.ready)
  const dbProvider = health?.database?.provider
  const dbConnected = health?.database?.connected === true
  const dbName = dbProvider === 'postgres' ? 'PostgreSQL' : dbProvider === 'sqlite' ? 'SQLite' : 'Database'

  return [
    {
      id: 'twilio',
      name: 'Twilio Voice',
      category: 'Outbound calling',
      connected: twilioOk,
      health: twilioOk && liveReady ? 'healthy' : twilioOk ? 'degraded' : 'offline',
      lastSync: health?.ok ? now : '—',
      summary: twilioOk
        ? `Outbound from ${health?.twilioFromNumber ?? 'configured number'} · ${health?.twilioAccount?.type ?? 'account'}`
        : 'Twilio credentials not configured',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      category: health?.callMode === 'ai' ? 'AI call conversations' : 'Optional (AI mode)',
      connected: health?.callMode === 'ai' ? aiOk : false,
      health:
        health?.callMode === 'ai'
          ? aiOk
            ? 'healthy'
            : 'offline'
          : 'offline',
      lastSync: health?.callMode === 'ai' && aiOk ? now : '—',
      summary:
        health?.callMode === 'ai'
          ? aiOk
            ? `Model: ${health.callAiModel ?? 'gpt-4o-mini'}`
            : 'CALL_MODE=ai requires OPENAI_API_KEY'
          : 'Keypad (DTMF) scripts active — set CALL_MODE=ai to enable speech',
    },
    {
      id: 'api',
      name: 'PharmaFlow API',
      category: 'Backend',
      connected: Boolean(health?.ok),
      health: health?.ok ? 'healthy' : 'offline',
      lastSync: health?.ok ? now : '—',
      summary: health?.ok
        ? `Service online · v${health.apiVersion ?? 1}`
        : 'API unavailable — check deployment health',
    },
    {
      id: 'database',
      name: dbName,
      category: 'Call jobs & tasks',
      connected: dbConnected,
      health: dbConnected ? 'healthy' : health?.database?.provider ? 'degraded' : 'offline',
      lastSync: dbConnected ? now : '—',
      summary: dbConnected
        ? 'Patients, call outcomes, follow-ups, and audit events persisted'
        : health?.database?.warning ?? 'Database connection unavailable',
    },
    {
      id: 'ngrok',
      name: 'Public webhook URL',
      category: 'Twilio webhooks',
      connected: Boolean(health?.liveCallReadiness?.ready && !health?.testMode),
      health: health?.testMode
        ? 'healthy'
        : health?.liveCallReadiness?.ready
          ? 'healthy'
          : 'degraded',
      lastSync: health?.publicBaseUrl ? now : '—',
      summary: health?.testMode
        ? 'Test mode — instant call simulation'
        : health?.liveCallReadiness?.ready
          ? health.publicBaseUrl ?? 'HTTPS webhook URL configured'
          : 'Configure PUBLIC_BASE_URL for live Twilio webhooks',
    },
  ]
}

export function useLiveIntegrations() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setHealth(await fetchHealth())
    } catch {
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 12000)
    return () => clearInterval(id)
  }, [refresh])

  return { integrations: buildIntegrations(health), health, loading, refresh }
}
