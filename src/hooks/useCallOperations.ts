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
  type CallJob,
  type CreateCallJobInput,
  type HealthResponse,
  type StaffTask,
} from '@/utils/api'

export function useCallOperations() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [jobs, setJobs] = useState<CallJob[]>([])
  const [tasks, setTasks] = useState<StaffTask[]>([])
  const [loading, setLoading] = useState(true)
  const [callingId, setCallingId] = useState<string | null>(null)

  const refresh = useCallback(async (silent = false) => {
    try {
      const [h, j, t] = await Promise.all([fetchHealth(), fetchCallJobs(), fetchTasks()])
      setHealth(h)
      setJobs(j)
      setTasks(t)
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
    const id = setInterval(() => void refresh(true), 8000)
    return () => {
      window.clearTimeout(timeoutId)
      clearInterval(id)
    }
  }, [refresh])

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
    if (health?.ok && !health.testMode) {
      const job = jobs.find((j) => j.id === id)
      const trialNote =
        health.twilioAccount?.type === 'Trial'
          ? ' This Twilio account is still on Trial — the number must be verified in Twilio Console.'
          : ''
      const ok = window.confirm(
        `Place a real Twilio call${job ? ` to ${job.phoneNumber}` : ''} from ${health.twilioFromNumber ?? 'your Twilio number'}?${trialNote}`,
      )
      if (!ok) return
    }
    setCallingId(id)
    try {
      const job = await startCall(id)
      if (job.twilioCallSid?.startsWith('TEST_')) {
        toast.success(`Simulated call completed for ${job.patientName} (no phone ring)`)
      } else {
        toast.success(`Calling ${job.patientName}…`)
      }
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Call failed'
      toast.error(msg, { duration: 8000 })
    } finally {
      setCallingId(null)
    }
  }

  const onCreate = async (input: CreateCallJobInput) => {
    try {
      const job = await createCallJob(input)
      if (job.validationStatus === 'valid') {
        toast.success(`${job.patientName} added to queue`)
      } else {
        toast.warning(`Added with validation issues: ${job.validationError ?? 'check fields'}`)
      }
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add patient')
      throw e
    }
  }

  const onRetry = async (id: string) => {
    setCallingId(id)
    try {
      await retryCall(id)
      toast.success('Retry initiated')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed')
    } finally {
      setCallingId(null)
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
    tasks,
    loading,
    callingId,
    refresh,
    onUpload,
    onCreate,
    onStart,
    onRetry,
    queued,
    completed,
    invalid,
  }
}
