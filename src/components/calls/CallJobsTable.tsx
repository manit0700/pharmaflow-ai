import { useState } from 'react'
import { Eye, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CallJobDetailPanel } from '@/components/calls/CallJobDetailPanel'
import type { CallJob, HealthResponse } from '@/utils/api'
import { canStartCall, isActiveCallStatus } from '@/utils/callStatus'
import { latestPatientReply } from '@/utils/liveTranscript'

const EDITABLE_STATUS_OPTIONS = [
  'queued',
  'in_progress',
  'completed',
  'no_answer',
  'failed',
  'escalated',
  'callback_requested',
  'voicemail',
] as const

function formatCallStatus(status: string) {
  if (status === 'completed') return 'Completed'
  return status.replace(/_/g, ' ')
}

function formatResolution(job: CallJob) {
  if (job.staffFollowUpNeeded) return 'Needs follow-up'
  if (job.resolutionStatus) return job.resolutionStatus.replace(/_/g, ' ')
  if (job.transcriptJson) return 'Transcript saved'
  return 'Waiting'
}

export function CallJobsTable({
  jobs,
  callingId,
  onStart,
  onRetry,
  onUpdateStatus,
  updatingStatusIds,
  health,
  emptyMessage = 'Upload an Excel file to create call jobs.',
}: {
  jobs: CallJob[]
  callingId: string | null
  onStart: (id: string) => void
  onRetry: (id: string) => void
  onUpdateStatus: (id: string, status: string) => void
  updatingStatusIds?: Record<string, boolean>
  health?: HealthResponse | null
  emptyMessage?: string
}) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const liveModeBlocked = Boolean(health?.ok && !health.testMode && !health.liveCallReadiness?.ready)
  const aiModeBlocked = Boolean(health?.callMode === 'ai' && health.aiCallConfigured === false)
  const detailJob = detailId ? jobs.find((j) => j.id === detailId) : null

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-3">Patient</th>
              <th className="pb-2 pr-3">Phone</th>
              <th className="pb-2 pr-3">Reason</th>
              <th className="pb-2 pr-3">Validation</th>
              <th className="pb-2 pr-3">Call status</th>
              <th className="pb-2 pr-3">Patient answer</th>
              <th className="pb-2 pr-3">Follow-up</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr
              key={j.id}
              className={
                isActiveCallStatus(j.callStatus) || callingId === j.id
                  ? 'border-b border-primary/30 bg-primary/5'
                  : 'border-b border-border/60'
              }
            >
                <td className="py-2.5 pr-3 font-medium">
                  <button
                    type="button"
                    className="text-left hover:text-primary hover:underline"
                    onClick={() => setDetailId(j.id)}
                  >
                    {j.patientName}
                  </button>
                </td>
                <td className="py-2.5 pr-3 font-mono text-xs">{j.phoneNumber}</td>
                <td className="py-2.5 pr-3 capitalize">{j.callReason.replace(/_/g, ' ')}</td>
                <td className="py-2.5 pr-3">
                  <Badge variant={j.validationStatus === 'valid' ? 'success' : 'destructive'}>
                    {j.validationStatus}
                  </Badge>
                </td>
                <td className="py-2.5 pr-3">
                  <div className="space-y-1">
                    <Select value={j.callStatus} onValueChange={(v) => onUpdateStatus(j.id, v)}>
                      <SelectTrigger className="h-8 w-44" disabled={Boolean(updatingStatusIds?.[j.id])}>
                        <SelectValue placeholder={formatCallStatus(j.callStatus)}>
                          {formatCallStatus(j.callStatus)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {EDITABLE_STATUS_OPTIONS.includes(j.callStatus as (typeof EDITABLE_STATUS_OPTIONS)[number]) ? null : (
                          <SelectItem value={j.callStatus} disabled>
                            {formatCallStatus(j.callStatus)}
                          </SelectItem>
                        )}
                        {EDITABLE_STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {formatCallStatus(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-[10px] text-muted-foreground">
                      {updatingStatusIds?.[j.id] ? 'Saving…' : 'Editable by staff'}
                    </div>
                  </div>
                  {j.errorMessage && (
                    <div className="max-w-72 truncate text-xs text-destructive" title={j.errorMessage}>
                      {j.errorMessage}
                    </div>
                  )}
                </td>
              <td className="py-2.5 pr-3">
                <div className="max-w-64 truncate" title={latestPatientReply(j) ?? undefined}>
                  {isActiveCallStatus(j.callStatus) ? (
                    <span className="text-primary font-medium">{latestPatientReply(j) ?? 'On call…'}</span>
                  ) : (
                    (j.patientResponse ?? '—')
                  )}
                </div>
                  {j.aiSummary && (
                    <div className="max-w-72 truncate text-xs text-muted-foreground" title={j.aiSummary}>
                      {j.aiSummary}
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <Badge variant={j.staffFollowUpNeeded ? 'warning' : 'secondary'}>
                    {formatResolution(j)}
                  </Badge>
                  {j.followUpReason && (
                    <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={j.followUpReason}>
                      {j.followUpReason}
                    </div>
                  )}
                  {j.transcriptJson && (
                    <div className="mt-1 text-xs text-muted-foreground">Transcript captured</div>
                  )}
                </td>
                <td className="py-2.5">
                  <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDetailId(j.id)}
                    title="View call details"
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      j.validationStatus !== 'valid' ||
                      callingId === j.id ||
                      liveModeBlocked ||
                      aiModeBlocked ||
                      !canStartCall(j.callStatus)
                    }
                    onClick={() => onStart(j.id)}
                    title={
                      aiModeBlocked
                        ? 'Set OPENAI_API_KEY for AI call mode'
                        : liveModeBlocked
                          ? health?.liveCallReadiness?.issues.join(' ')
                          : !canStartCall(j.callStatus)
                            ? 'Call already in progress or completed — use Retry'
                            : 'Start outbound call'
                    }
                  >
                    <Phone className="h-3 w-3" />
                    Call
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={callingId === j.id || liveModeBlocked || aiModeBlocked}
                    onClick={() => onRetry(j.id)}
                    title={
                      aiModeBlocked
                        ? 'Set OPENAI_API_KEY for AI call mode'
                        : liveModeBlocked
                          ? health?.liveCallReadiness?.issues.join(' ')
                          : 'Retry call'
                    }
                  >
                    Retry
                  </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
      {detailJob && <CallJobDetailPanel job={detailJob} onClose={() => setDetailId(null)} />}
    </div>
  )
}
