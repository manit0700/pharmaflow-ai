import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { FOLLOW_UPS_MOCK, getOpenFollowUpCount } from '@/data/followUpsMock'
import type { FollowUpActivity, FollowUpTask } from '@/types/followUps'
import { createStaffTask, fetchTasks, updateTask as patchStaffTask } from '@/utils/api'
import {
  followUpToStaffTaskPayload,
  isMockFollowUpId,
  staffTaskToFollowUp,
} from '@/utils/staffTaskMapper'

export type FollowUpDataSource = 'api' | 'mock' | 'loading'

interface FollowUpContextValue {
  tasks: FollowUpTask[]
  openCount: number
  dataSource: FollowUpDataSource
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  updateTask: (id: string, patch: Partial<FollowUpTask>) => Promise<void>
  addTask: (task: FollowUpTask) => Promise<FollowUpTask | void>
  appendActivity: (id: string, activity: FollowUpActivity) => Promise<void>
}

const FollowUpContext = createContext<FollowUpContextValue | null>(null)

export function FollowUpProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<FollowUpTask[]>([])
  const [dataSource, setDataSource] = useState<FollowUpDataSource>('loading')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const apiTasks = await fetchTasks()
      if (apiTasks.length > 0) {
        setTasks(apiTasks.map(staffTaskToFollowUp))
        setDataSource('api')
      } else {
        setTasks(FOLLOW_UPS_MOCK)
        setDataSource('mock')
      }
    } catch {
      setTasks(FOLLOW_UPS_MOCK)
      setDataSource('mock')
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 15000)
    return () => clearInterval(id)
  }, [refresh])

  const persistPatch = useCallback(
    async (id: string, next: FollowUpTask) => {
      if (dataSource !== 'api' || isMockFollowUpId(id)) return
      await patchStaffTask(id, followUpToStaffTaskPayload(next))
    },
    [dataSource],
  )

  const updateTask = useCallback(
    async (id: string, patch: Partial<FollowUpTask>) => {
      let updated: FollowUpTask | null = null
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          updated = { ...t, ...patch, updatedAt: new Date().toISOString() }
          return updated
        }),
      )
      if (!updated) return
      try {
        await persistPatch(id, updated)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save task update')
      }
    },
    [persistPatch],
  )

  const appendActivity = useCallback(
    async (id: string, activity: FollowUpActivity) => {
      const task = tasks.find((t) => t.id === id)
      if (!task) return
      await updateTask(id, {
        activity: [...task.activity, activity],
        lastActivityAt: activity.timestamp,
      })
    },
    [tasks, updateTask],
  )

  const addTask = useCallback(
    async (task: FollowUpTask) => {
      if (dataSource === 'api') {
        try {
          const payload = followUpToStaffTaskPayload(task)
          const created = await createStaffTask({
            patientName: payload.patientName as string,
            phoneNumber: payload.phoneNumber as string,
            taskType: payload.taskType as string,
            priority: payload.priority as string,
            status: payload.status as string,
            assignedTeam: payload.assignedTeam as string,
            dueDate: payload.dueDate as string,
            dueTime: payload.dueTime as string,
            sourceWorkflow: payload.sourceWorkflow as string,
            issueSummary: payload.issueSummary as string,
            aiSummary: payload.aiSummary as string,
            activityJson: payload.activityJson as string,
            notes: payload.notes as string,
          })
          const mapped = staffTaskToFollowUp(created)
          setTasks((prev) => [mapped, ...prev])
          return mapped
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not create task')
          throw e
        }
      }
      setTasks((prev) => [task, ...prev])
      return task
    },
    [dataSource],
  )

  const openCount = useMemo(() => getOpenFollowUpCount(tasks), [tasks])

  return (
    <FollowUpContext.Provider
      value={{
        tasks,
        openCount,
        dataSource,
        loading,
        error,
        refresh,
        updateTask,
        addTask,
        appendActivity,
      }}
    >
      {children}
    </FollowUpContext.Provider>
  )
}

export function useFollowUpContext() {
  const ctx = useContext(FollowUpContext)
  if (!ctx) throw new Error('useFollowUpContext must be used within FollowUpProvider')
  return ctx
}
