import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  createCallJob,
  fetchCallJobs,
  fetchHealth,
  fetchTasks,
  importExcel,
  retryCall,
  startCall,
  updateCallJob,
  type CallJob,
  type CreateCallJobInput,
  type HealthResponse,
  type StaffTask,
} from '@/utils/api'
import { isActiveCallStatus } from '@/utils/callStatus'

const LOCAL_JOBS_KEY = 'pharmaflow.callJobs'

function readLocalJobs(): CallJob[] {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_JOBS_KEY) ?? '[]') as CallJob[]
  } catch {
    return []
  }
}

function writeLocalJobs(jobs: CallJob[]) {
  try {
    window.localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(jobs.slice(0, 100)))
  } catch {
    // Ignore storage errors (private mode/quota) and keep in-memory state.
  }
}

function mergeJobs(serverJobs: CallJob[], localJobs: CallJob[]) {
  const byId = new Map<string, CallJob>()
  for (const job of localJobs) byId.set(job.id, job)
  for (const job of serverJobs) byId.set(job.id, { ...byId.get(job.id), ...job })
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export function useCallOperations() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [jobs, setJobs] = useState<CallJob[]>(() =>
    typeof window === 'undefined' ? [] : readLocalJobs(),
  )
  const [tasks, setTasks] = useState<StaffTask[]>([])
  const [loading, setLoading] = useState(true)
  const [callingId, setCallingId] = useState<string | null>(null)

  const refresh = useCallback(async (silent = false) => {
    try {
      const h = await fetchHealth()
      const [jobsResult, tasksResult] = await Promise.allSettled([fetchCallJobs(), fetchTasks()])
      setHealth(h)
      setJobs((prev) => {
        const mergedJobs = mergeJobs(
          jobsResult.status === 'fulfilled' ? jobsResult.value : [],
          prev,
        )
        writeLocalJobs(mergedJobs)
        return mergedJobs
      })
      setTasks(tasksResult.status === 'fulfilled' ? tasksResult.value : [])
    } catch (e) {
      if (!silent) {
        toast.error(e instanceof Error ? e.message : 'Backend unavailable')
      }
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [refresh])

  const activeJobs = jobs.filter((j) => isActiveCallStatus(j.callStatus))

  useEffect(() => {
    const ms = activeJobs.length > 0 || callingId ? 2000 : 8000
    const id = setInterval(() => void refresh(true), ms)
    return () => clearInterval(id)
  }, [refresh, activeJobs.length, callingId])

  const onUpload = async (file: File) => {
    try {
      const result = await importExcel(file)
      toast.success(`Imported ${result.imported} rows (${result.valid} valid)`)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    }
  }

  const onStart = async (id: string) => {
    const currentJob = jobs.find((j) => j.id === id)
    if (health?.callMode === 'ai' && health.aiCallConfigured === false) {
      toast.error('AI call mode needs OPENAI_API_KEY in server/local.config.json')
      return
    }
    if (health?.ok && !health.testMode && !health.liveCallReadiness?.ready) {
      toast.error(health.liveCallReadiness?.issues.join(' ') ?? 'Live Twilio is not configured')
      return
    }
    if (health?.ok && !health.testMode) {
      const trialNote =
        health.twilioAccount?.type === 'Trial'
          ? ' This Twilio account is still on Trial — the number must be verified in Twilio Console.'
          : ''
      const ok = window.confirm(
        `Place a real Twilio call${currentJob ? ` to ${currentJob.phoneNumber}` : ''} from ${health.twilioFromNumber ?? 'your Twilio number'}?${trialNote}`,
      )
      if (!ok) return
    }
    setCallingId(id)
    try {
      if (!currentJob) {
        await refresh(true)
        throw new Error('Call job not found in dashboard state. Please try again.')
      }
      const job = await startCall(currentJob)
      setJobs((prev) => {
        const next = mergeJobs([job], prev)
        writeLocalJobs(next)
        return next
      })
      if (job.twilioCallSid?.startsWith('TEST_')) {
        toast.success(`Simulated call completed for ${job.patientName} (no phone ring)`)
        setCallingId(null)
      } else {
        toast.success(`Calling ${job.patientName} — watch Live calls below`)
        setTimeout(() => setCallingId(null), 5000)
      }
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Call failed'
      toast.error(msg, { duration: 8000 })
      setCallingId(null)
    }
  }

  const onCreate = async (input: CreateCallJobInput) => {
    try {
      const job = await createCallJob(input)
      setJobs((prev) => {
        const next = [{ ...job }, ...prev.filter((j) => j.id !== job.id)].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        writeLocalJobs(next)
        return next
      })
      if (job.validationStatus === 'valid') {
        toast.success(`${job.patientName} added to queue`)
      } else {
        toast.warning(`Added with validation issues: ${job.validationError ?? 'check fields'}`)
      }
      await refresh(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add patient')
      throw e
    }
  }

  const onRetry = async (id: string) => {
    const currentJob = jobs.find((j) => j.id === id)
    setCallingId(id)
    try {
      if (!currentJob) {
        await refresh(true)
        throw new Error('Call job not found in dashboard state. Please try again.')
      }
      const job = await retryCall(currentJob)
      setJobs((prev) => {
        const next = mergeJobs([job], prev)
        writeLocalJobs(next)
        return next
      })
      toast.success('Retry initiated — watch Live calls below')
      setTimeout(() => setCallingId(null), 5000)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed')
      setCallingId(null)
    }
  }

  const onUpdateStatus = async (id: string, callStatus: string) => {
    try {
      const updated = await updateCallJob(id, { callStatus })
      setJobs((prev) => {
        const next = mergeJobs([updated], prev)
        writeLocalJobs(next)
        return next
      })
      toast.success(`Call status updated to ${callStatus.replace(/_/g, ' ')}`)
      await refresh(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update call status')
    }
  }

  const queued = jobs.filter(
    (j) => j.validationStatus === 'valid' && !['completed', 'failed'].includes(j.callStatus),
  )
  const completed = jobs.filter((j) => j.callStatus === 'completed')
  const invalid = jobs.filter((j) => j.validationStatus !== 'valid')

  return {
    health,
    jobs,
    activeJobs,
    tasks,
    loading,
    callingId,
    refresh,
    onUpload,
    onCreate,
    onStart,
    onRetry,
    onUpdateStatus,
    queued,
    completed,
    invalid,
  }
}
