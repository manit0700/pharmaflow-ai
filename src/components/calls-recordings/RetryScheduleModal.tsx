import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CallJob, HealthResponse, ScheduleRetryInput } from '@/utils/api'

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInputValue(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

export function RetryScheduleModal({
  open,
  job,
  health,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean
  job: CallJob | null
  health: HealthResponse | null
  busy?: boolean
  onClose: () => void
  onSubmit: (input: ScheduleRetryInput) => Promise<void>
}) {
  const [scheduledFor, setScheduledFor] = useState('')
  const [reason, setReason] = useState('')
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false)
  const [placeImmediately, setPlaceImmediately] = useState(false)

  useEffect(() => {
    if (!open || !job) return
    const id = window.setTimeout(() => {
      setScheduledFor(toLocalInputValue(job.retryRecommendation?.recommendedRetryAt))
      setReason(job.retryRecommendation?.reason ?? '')
      setCreateFollowUpTask(false)
      setPlaceImmediately(false)
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, job])

  if (!open || !job) return null

  const liveBlocked = Boolean(health?.ok && !health.testMode && !health.liveCallReadiness?.ready)
  const provider = health?.phoneProvider
  const carrierName = provider?.carrierName ?? 'Twilio'
  const trialNote =
    (provider?.account ?? health?.twilioAccount)?.type === 'Trial'
      ? ` ${carrierName} Trial accounts can only call verified destination numbers.`
      : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label="Schedule retry call"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Schedule retry call</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new retry call job for {job.patientName}. Recommended: {job.retryRecommendation?.nextActionLabel}.
        </p>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="retry-time">Retry time</Label>
            <Input
              id="retry-time"
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="retry-reason">Reason</Label>
            <Textarea
              id="retry-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={createFollowUpTask}
              onChange={(e) => setCreateFollowUpTask(e.target.checked)}
            />
            <span>Also create a follow-up task for pharmacy staff</span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={placeImmediately}
              disabled={liveBlocked}
              onChange={(e) => setPlaceImmediately(e.target.checked)}
            />
            <span>
              Place call now (requires live calling)
              {liveBlocked && ' — live calling is not ready.'}
              {trialNote}
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void onSubmit({
                scheduledFor: fromLocalInputValue(scheduledFor),
                reason,
                createFollowUpTask,
                placeImmediately,
              })
            }
          >
            {placeImmediately ? 'Retry now' : 'Schedule retry'}
          </Button>
        </div>
      </div>
    </div>
  )
}
