import { useMemo } from 'react'
import { conversations as seedConversations } from '@/data/mockData'
import { useLiveDemo } from '@/context/LiveDemoContext'
import type { Conversation } from '@/types'

export function useConversationList(): Conversation[] {
  const { liveRecordings } = useLiveDemo()
  return useMemo(
    () => [...liveRecordings, ...seedConversations],
    [liveRecordings],
  )
}
