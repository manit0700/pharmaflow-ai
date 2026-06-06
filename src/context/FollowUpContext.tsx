import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { FOLLOW_UPS_MOCK, getOpenFollowUpCount } from '@/data/followUpsMock'
import type { FollowUpTask } from '@/types/followUps'

interface FollowUpContextValue {
  tasks: FollowUpTask[]
  setTasks: React.Dispatch<React.SetStateAction<FollowUpTask[]>>
  openCount: number
  updateTask: (id: string, patch: Partial<FollowUpTask>) => void
  addTask: (task: FollowUpTask) => void
}

const FollowUpContext = createContext<FollowUpContextValue | null>(null)

export function FollowUpProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<FollowUpTask[]>(FOLLOW_UPS_MOCK)

  const updateTask = (id: string, patch: Partial<FollowUpTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
    )
  }

  const addTask = (task: FollowUpTask) => {
    setTasks((prev) => [task, ...prev])
  }

  const openCount = useMemo(() => getOpenFollowUpCount(tasks), [tasks])

  return (
    <FollowUpContext.Provider value={{ tasks, setTasks, openCount, updateTask, addTask }}>
      {children}
    </FollowUpContext.Provider>
  )
}

export function useFollowUpContext() {
  const ctx = useContext(FollowUpContext)
  if (!ctx) throw new Error('useFollowUpContext must be used within FollowUpProvider')
  return ctx
}
