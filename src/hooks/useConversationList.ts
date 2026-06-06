import { useCallback, useEffect, useState } from 'react'
import { fetchCallJobs } from '@/utils/api'
import { callJobToConversation, isAttemptedCall } from '@/utils/callJobToConversation'
import type { Conversation } from '@/types'

export function useConversationList(): {
  conversations: Conversation[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const jobs = await fetchCallJobs()
      const list = jobs
        .filter(isAttemptedCall)
        .map(callJobToConversation)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      setConversations(list)
    } catch {
      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 10000)
    return () => clearInterval(id)
  }, [refresh])

  return { conversations, loading, refresh }
}
