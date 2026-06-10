import { useCallback, useEffect, useState } from 'react'
import { fetchHealth, type HealthResponse } from '@/utils/api'
import type { IntegrationStatus } from '@/types'

function buildIntegrations(health: HealthResponse | null): IntegrationStatus[] {
  const now = new Date().toISOString()
  const twilioOk = Boolean(health?.twilioConfigured)
  const aiOk = health?.callMode !== 'ai' || health.aiCallConfigured === true
  const liveReady = Boolean(health?.testMode || health?.liveCallReadiness?.ready)

  return [
    {
      id: 'twilio',
      name: 'Twilio Voice',
      category: 'Outbound calling',
      connected: twilioOk,
      health: twilioOk && liveReady ? 'healthy' : twilioOk ? 'degraded' : 'offline',
      lastSync: health?.ok ? now : '—',
      summary: twilioOk
        ? `From ${health?.twilioFromNumber ?? 'configured'} · ${health?.twilioAccount?.type ?? 'account'}`
        : 'Set TWILIO_ACCOUNT_SID, API key, and TWILIO_PHONE_NUMBER in local.config.json',
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
          : 'Using keypad (DTMF) scripts — set CALL_MODE=ai to enable',
    },
    {
      id: 'api',
      name: 'PharmaFlow API',
      category: 'Backend',
      connected: Boolean(health?.ok),
      health: health?.ok ? 'healthy' : 'offline',
      lastSync: health?.ok ? now : '—',
      summary: health?.ok
        ? `Port ${health.port ?? 4002} · config: ${health.configSource ?? 'env'}`
        : 'Run npm run dev:pc to start the API',
    },
    {
      id: 'database',
      name: 'SQLite database',
      category: 'Call jobs & tasks',
      connected: Boolean(health?.ok),
      health: health?.ok ? 'healthy' : 'offline',
      lastSync: health?.ok ? now : '—',
      summary: 'Stores patients, call results, staff follow-ups, and audit events',
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
        ? 'Test mode — webhooks not required'
        : health?.liveCallReadiness?.ready
          ? health.publicBaseUrl ?? 'HTTPS URL configured'
          : 'Set PUBLIC_BASE_URL to ngrok HTTPS URL for live calls',
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
