import { useState } from 'react'
import { Eye, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CallJobDetailPanel } from '@/components/calls/CallJobDetailPanel'
import type { CallJob, HealthResponse } from '@/utils/api'
import { canStartCall, isActiveCallStatus } from '@/utils/callStatus'
import { latestPatientReply } from '@/utils/liveTranscript'

const CALL_STATUS_OPTIONS = [
  'queued',
  'queued_live',
  'dialing',
  'ringing',
  'in_progress',
  'completed',
  'callback_requested',
  'escalated',
  'voicemail',
  'no_answer',
  'busy',
  'failed',
  'resolved',
]

const FOLLOW_UP_REASON_OPTIONS = [
  'Callback requested',
  'Patient hung up or call ended before menu response',
  'No answer',
  'Failed call',
  'DOB verification failed',
  'Insurance review needed',
  'Pharmacist review needed',
  'Delivery issue',
  'Staff review',
]

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

function followUpMatches(job: CallJob, filter: string) {
  if (filter === 'needs_follow_up') return job.staffFollowUpNeeded
  if (filter === 'no_follow_up') return !job.staffFollowUpNeeded
  if (filter === 'has_reason') return Boolean(job.followUpReason)
  return true
}

function formatReason(reason: string) {
  return reason.replace(/_/g, ' ')
}

export function CallJobsTable({
  jobs,
  callingId,
  onStart,
  onRetry,
  onPreviewScript,
  onSaveNotes,
  onUpdateJob,
  onResolve,
  onAddDoNotCall,
  health,
  emptyMessage = 'Upload an Excel file to create call jobs.',
}: {
  jobs: CallJob[]
  callingId: string | null
  onStart: (id: string) => void
  onRetry: (id: string) => void
  onPreviewScript?: (id: string) => Promise<{ script: string }>
  onSaveNotes?: (id: string, staffNotes: string) => void
  onUpdateJob?: (
    job: CallJob,
    data: {
      callStatus?: string
      staffFollowUpNeeded?: boolean
      followUpReason?: string | null
      resolutionStatus?: string | null
      resolvedBy?: string
    },
  ) => void
  onResolve?: (id: string, staffNotes?: string) => void
  onAddDoNotCall?: (job: CallJob) => void
  health?: HealthResponse | null
  emptyMessage?: string
}) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [followUpFilter, setFollowUpFilter] = useState('all')
  const [reasonFilter, setReasonFilter] = useState('all')
  const liveModeBlocked = Boolean(health?.ok && !health.testMode && !health.liveCallReadiness?.ready)
  const aiModeBlocked = Boolean(health?.callMode === 'ai' && health.aiCallConfigured === false)
  const statuses = Array.from(new Set(jobs.map((j) => j.callStatus))).sort()
  const reasons = Array.from(new Set(jobs.map((j) => j.callReason))).sort()
  const filteredJobs = jobs.filter((j) => {
    const statusOk = statusFilter === 'all' || j.callStatus === statusFilter
    const reasonOk = reasonFilter === 'all' || j.callReason === reasonFilter
    return statusOk && reasonOk && followUpMatches(j, followUpFilter)
  })
  const detailJob = detailId ? jobs.find((j) => j.id === detailId) : null

  const hasActiveFilters =
    statusFilter !== 'all' || reasonFilter !== 'all' || followUpFilter !== 'all'

  const clearFilters = () => {
    setStatusFilter('all')
    setReasonFilter('all')
    setFollowUpFilter('all')
  }

  const renderCallActions = (job: CallJob) => (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setDetailId(job.id)}
        title="View call details"
      >
        <Eye className="h-3 w-3" />
      </Button>
      <Button
        size="sm"
        disabled={
          job.validationStatus !== 'valid' ||
          callingId === job.id ||
          liveModeBlocked ||
          aiModeBlocked ||
          !canStartCall(job.callStatus)
        }
        onClick={() => onStart(job.id)}
        title={
          aiModeBlocked
            ? 'Set OPENAI_API_KEY for AI call mode'
            : liveModeBlocked
              ? health?.liveCallReadiness?.issues.join(' ')
              : !canStartCall(job.callStatus)
                ? 'Call already in progress or completed - use Retry'
                : 'Start outbound call'
        }
      >
        <Phone className="h-3 w-3" />
        Call
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={callingId === job.id || liveModeBlocked || aiModeBlocked}
        onClick={() => onRetry(job.id)}
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
  )

  const renderReasonFilterSelect = () => (
    <Select value={reasonFilter} onValueChange={setReasonFilter}>
      <SelectTrigger className="h-8 w-full bg-background text-xs sm:w-44">
        <SelectValue placeholder="Reason" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All reasons</SelectItem>
        {reasons.map((reason) => (
          <SelectItem key={reason} value={reason}>
            {formatReason(reason)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const renderStatusFilterSelect = () => (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="h-8 w-full bg-background text-xs sm:w-40">
        <SelectValue placeholder="Call status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {statuses.map((status) => (
          <SelectItem key={status} value={status}>
            {formatCallStatus(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const renderFollowUpFilterSelect = () => (
    <Select value={followUpFilter} onValueChange={setFollowUpFilter}>
      <SelectTrigger className="h-8 w-full bg-background text-xs sm:w-44">
        <SelectValue placeholder="Follow-up" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All follow-up</SelectItem>
        <SelectItem value="needs_follow_up">Needs follow-up</SelectItem>
        <SelectItem value="no_follow_up">No follow-up</SelectItem>
        <SelectItem value="has_reason">Has reason</SelectItem>
      </SelectContent>
    </Select>
  )

  const updateStatus = (job: CallJob, callStatus: string) => {
    const followUpReason =
      callStatus === 'no_answer'
        ? 'No answer'
        : callStatus === 'failed'
          ? 'Failed call'
          : callStatus === 'callback_requested'
            ? 'Callback requested'
            : callStatus === 'escalated'
              ? (job.followUpReason ?? 'Staff review')
              : job.followUpReason
    onUpdateJob?.(job, {
      callStatus,
      staffFollowUpNeeded: ['no_answer', 'failed', 'callback_requested', 'escalated'].includes(callStatus)
        ? true
        : callStatus === 'resolved' || callStatus === 'completed'
          ? false
          : job.staffFollowUpNeeded,
      followUpReason: callStatus === 'resolved' || callStatus === 'completed' ? null : followUpReason,
      resolutionStatus: callStatus === 'resolved' ? 'resolved' : job.resolutionStatus,
      resolvedBy: callStatus === 'resolved' ? 'staff' : undefined,
    })
  }

  const updateFollowUpState = (job: CallJob, value: string) => {
    if (value === 'resolved') {
      onUpdateJob?.(job, {
        callStatus: 'resolved',
        resolutionStatus: 'resolved',
        staffFollowUpNeeded: false,
        followUpReason: null,
        resolvedBy: 'staff',
      })
      return
    }
    if (value === 'needs_follow_up') {
      onUpdateJob?.(job, {
        staffFollowUpNeeded: true,
        followUpReason: job.followUpReason ?? 'Staff review',
      })
      return
    }
    onUpdateJob?.(job, {
      staffFollowUpNeeded: false,
      followUpReason: null,
      resolutionStatus: null,
    })
  }

  const updateFollowUpReason = (job: CallJob, value: string) => {
    onUpdateJob?.(job, {
      staffFollowUpNeeded: value !== 'none',
      followUpReason: value === 'none' ? null : value,
    })
  }

  const followUpState = (job: CallJob) => {
    if (job.callStatus === 'resolved' || job.resolutionStatus === 'resolved') return 'resolved'
    if (job.staffFollowUpNeeded) return 'needs_follow_up'
    return 'waiting'
  }

  const renderRowStatusSelect = (job: CallJob) => {
    if (!onUpdateJob) return <div>{formatCallStatus(job.callStatus)}</div>
    const options = Array.from(new Set([...CALL_STATUS_OPTIONS, job.callStatus]))
    return (
      <Select value={job.callStatus} onValueChange={(value) => updateStatus(job, value)}>
        <SelectTrigger className="h-8 w-full min-w-36 bg-background text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((status) => (
            <SelectItem key={status} value={status}>
              {formatCallStatus(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  const renderRowFollowUpSelect = (job: CallJob) => {
    if (!onUpdateJob) {
      return (
        <Badge variant={job.staffFollowUpNeeded ? 'warning' : 'secondary'}>
          {formatResolution(job)}
        </Badge>
      )
    }
    return (
      <Select value={followUpState(job)} onValueChange={(value) => updateFollowUpState(job, value)}>
        <SelectTrigger className="h-8 w-full min-w-40 bg-background text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="waiting">Waiting</SelectItem>
          <SelectItem value="needs_follow_up">Needs follow-up</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  const renderRowReasonSelect = (job: CallJob) => {
    if (!onUpdateJob) return null
    return (
      <Select value={job.followUpReason ?? 'none'} onValueChange={(value) => updateFollowUpReason(job, value)}>
        <SelectTrigger className="mt-1 h-8 w-full min-w-48 bg-background text-xs">
          <SelectValue placeholder="Reason" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No follow-up reason</SelectItem>
          {FOLLOW_UP_REASON_OPTIONS.map((reason) => (
            <SelectItem key={reason} value={reason}>
              {reason}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Showing {filteredJobs.length} of {jobs.length}</span>
        {hasActiveFilters && (
          <Button size="sm" variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:hidden">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Reason</div>
          {renderReasonFilterSelect()}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Call status</div>
          {renderStatusFilterSelect()}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Follow-up</div>
          {renderFollowUpFilterSelect()}
        </div>
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-3">Patient</th>
              <th className="pb-2 pr-3">Phone</th>
              <th className="pb-2 pr-3">
                {renderReasonFilterSelect()}
              </th>
              <th className="pb-2 pr-3">Validation</th>
              <th className="pb-2 pr-3">
                {renderStatusFilterSelect()}
              </th>
              <th className="pb-2 pr-3">Patient answer</th>
              <th className="pb-2 pr-3">
                {renderFollowUpFilterSelect()}
              </th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map((j) => (
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
                  {j.duplicateOfId && (
                    <div className="mt-1 text-xs text-warning">Possible duplicate</div>
                  )}
                  {j.doNotCall && (
                    <div className="mt-1 text-xs text-destructive">Do-not-call</div>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  {renderRowStatusSelect(j)}
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
                  {renderRowFollowUpSelect(j)}
                  {j.followUpReason && (
                    <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={j.followUpReason}>
                      {j.followUpReason}
                    </div>
                  )}
                  {renderRowReasonSelect(j)}
                  {j.transcriptJson && (
                    <div className="mt-1 text-xs text-muted-foreground">Transcript captured</div>
                  )}
                </td>
                <td className="py-2.5">
                  {renderCallActions(j)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:hidden">
        {filteredJobs.map((j) => (
          <div
            key={j.id}
            className={
              isActiveCallStatus(j.callStatus) || callingId === j.id
                ? 'rounded-lg border border-primary/30 bg-primary/5 p-3'
                : 'rounded-lg border border-border/70 bg-card p-3'
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  className="truncate text-left font-medium hover:text-primary hover:underline"
                  onClick={() => setDetailId(j.id)}
                >
                  {j.patientName}
                </button>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{j.phoneNumber}</div>
              </div>
              <Badge variant={j.validationStatus === 'valid' ? 'success' : 'destructive'}>
                {j.validationStatus}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Reason</div>
                <div className="mt-1 capitalize">{formatReason(j.callReason)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Call status</div>
                <div className="mt-1">{renderRowStatusSelect(j)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Patient answer</div>
                <div className="mt-1 truncate" title={latestPatientReply(j) ?? undefined}>
                  {isActiveCallStatus(j.callStatus)
                    ? (latestPatientReply(j) ?? 'On call...')
                    : (j.patientResponse ?? '-')}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Follow-up</div>
                <div className="mt-1">{renderRowFollowUpSelect(j)}</div>
              </div>
            </div>
            {j.followUpReason && (
              <div className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Reason: </span>
                {j.followUpReason}
              </div>
            )}
            {renderRowReasonSelect(j)}
            {j.errorMessage && (
              <div className="mt-3 text-xs text-destructive">{j.errorMessage}</div>
            )}
            <div className="mt-3">{renderCallActions(j)}</div>
          </div>
        ))}
      </div>
      {jobs.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      )}
      {jobs.length > 0 && filteredJobs.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No call jobs match the selected filters.
        </p>
      )}
      {detailJob && (
        <CallJobDetailPanel
          job={detailJob}
          onClose={() => setDetailId(null)}
          onPreviewScript={onPreviewScript}
          onSaveNotes={onSaveNotes}
          onResolve={onResolve}
          onAddDoNotCall={onAddDoNotCall}
        />
      )}
    </div>
  )
}
