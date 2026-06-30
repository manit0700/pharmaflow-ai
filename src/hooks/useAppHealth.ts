import { useCallback, useEffect, useState } from 'react'
import { fetchHealth, type HealthResponse } from '@/utils/api'

export function useAppHealth(pollMs = 15000) {
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
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    if (pollMs <= 0) return
    const id = setInterval(() => void refresh(), pollMs)
    return () => {
      window.clearTimeout(timeoutId)
      clearInterval(id)
    }
  }, [pollMs, refresh])

  const dbConnected = health?.database?.connected === true
  const dbLabel = health?.database?.provider === 'postgres' ? 'Postgres' : 'Database'

  return { health, loading, refresh, dbConnected, dbLabel }
}
