import { useState } from 'react'
import { ChevronDown, ChevronUp, Phone, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CallJob, HealthResponse } from '@/utils/api'
import { canStartCall, isActiveCallStatus } from '@/utils/callStatus'
import { latestPatientReply } from '@/utils/liveTranscript'
import { buildLiveFeed } from '@/utils/liveTranscript'
import { cn } from '@/lib/utils'

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

type RxItem = { name: string; cost: number }
type ChatMessage = { role: string; content: string }

function parsePrescriptions(json: string | null): RxItem[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as RxItem[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch { return null }
}

function parseMessages(json: string | null): ChatMessage[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as ChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function ExpandedRow({ job }: { job: CallJob }) {
  const rxList = parsePrescriptions(job.prescriptionsJson)
  const messages = parseMessages(job.messagesJson)
  const liveFeed = buildLiveFeed(job)
  const conversationItems =
    liveFeed.length > 0
      ? liveFeed.map((item) => ({ role: item.speaker === 'pharmacy' ? 'assistant' : item.speaker, content: item.text }))
      : messages.filter((m) => m.role !== 'system')

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2">
      {/* Left: patient info + prescriptions */}
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">DOB</p>
            <p>{job.dob}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Call reason</p>
            <p className="capitalize">{job.callReason.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Status</p>
            <p className="capitalize">{job.callStatus.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Validation</p>
            <Badge variant={job.validationStatus === 'valid' ? 'success' : 'destructive'} className="text-[10px]">
              {job.validationStatus}
            </Badge>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
            Prescriptions {rxList && rxList.length > 1 ? `(${rxList.length})` : ''}
          </p>
          {rxList ? (
            <ul className="space-y-0.5 rounded-md border border-border/60 bg-muted/30 p-2">
              {rxList.map((rx, i) => (
                <li key={i} className="flex justify-between text-xs">
                  <span>{rx.name}</span>
                  {rx.cost > 0 && <span className="text-green-700 dark:text-green-400 font-medium">${rx.cost.toFixed(2)}</span>}
                </li>
              ))}
              {job.prescriptionCost != null && rxList.length > 1 && (
                <li className="flex justify-between text-xs font-semibold border-t border-border/60 pt-1 mt-1">
                  <span>Total due</span>
                  <span className="text-green-700 dark:text-green-400">${job.prescriptionCost.toFixed(2)}</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs">{job.medicationName}{job.prescriptionCost != null ? ` — $${job.prescriptionCost.toFixed(2)}` : ''}</p>
          )}
        </div>

        {(job.patientResponse || job.aiSummary) && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-1.5">
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Patient answer</p>
              <p className="text-xs">{job.patientResponse ?? '—'}</p>
            </div>
            {job.aiSummary && (
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Staff summary</p>
                <p className="text-xs">{job.aiSummary}</p>
              </div>
            )}
          </div>
        )}

        {job.followUpReason && (
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Follow-up reason</p>
            <p className="text-xs">{job.followUpReason}</p>
          </div>
        )}
        {job.errorMessage && (
          <p className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs text-destructive">{job.errorMessage}</p>
        )}
        {job.twilioCallSid && (
          <p className="font-mono text-[10px] text-muted-foreground">SID: {job.twilioCallSid}</p>
        )}
      </div>

      {/* Right: conversation transcript */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
          Conversation {conversationItems.length > 0 ? `(${conversationItems.filter(m => m.role !== 'system').length} messages)` : ''}
        </p>
        {conversationItems.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No transcript yet.</p>
        ) : (
          <div className="max-h-56 space-y-1.5 overflow-auto rounded-md border border-border/60 bg-muted/20 p-2">
            {conversationItems.map((m, i) => {
              const isAi = m.role === 'assistant'
              const isPatient = m.role === 'user' || m.role === 'patient'
              if (!isAi && !isPatient) return null
              return (
                <div key={`${m.role}-${i}`} className={cn('flex flex-col gap-0.5', isAi && 'items-end')}>
                  <span className="text-[9px] font-semibold uppercase text-muted-foreground">
                    {isAi ? 'Pharmacy' : 'Patient'}
                  </span>
                  <div className={cn(
                    'rounded-xl px-2.5 py-1.5 text-xs max-w-[90%] leading-relaxed',
                    isAi && 'bg-primary/10',
                    isPatient && 'bg-muted',
                  )}>
                    {m.content}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function CallJobsTable({
  jobs,
  callingId,
  onStart,
  onRetry,
  onDelete,
  onUpdateStatus,
  updatingStatusIds,
  health,
  emptyMessage = 'Upload an Excel file to create call jobs.',
}: {
  jobs: CallJob[]
  callingId: string | null
  onStart: (id: string) => void
  onRetry: (id: string) => void
  onDelete: (id: string) => void
  onUpdateStatus: (id: string, status: string) => void
  updatingStatusIds?: Record<string, boolean>
  health?: HealthResponse | null
  emptyMessage?: string
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const liveModeBlocked = Boolean(health?.ok && !health.testMode && !health.liveCallReadiness?.ready)
  const aiModeBlocked = Boolean(health?.callMode === 'ai' && health.aiCallConfigured === false)

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-3 w-4" />
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
            <>
              <tr
                key={j.id}
                className={cn(
                  'border-b',
                  expandedId === j.id ? 'border-primary/30 bg-primary/5' : isActiveCallStatus(j.callStatus) || callingId === j.id ? 'border-b border-primary/20 bg-primary/5' : 'border-border/60',
                )}
              >
                {/* Expand toggle */}
                <td className="py-2.5 pr-1 w-6">
                  <button
                    type="button"
                    onClick={() => toggle(j.id)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                    title={expandedId === j.id ? 'Collapse' : 'Show conversation'}
                  >
                    {expandedId === j.id
                      ? <ChevronUp className="h-3.5 w-3.5" />
                      : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </td>

                <td className="py-2.5 pr-3">
                  <button
                    type="button"
                    className="text-left font-medium hover:text-primary hover:underline"
                    onClick={() => toggle(j.id)}
                  >
                    {j.patientName}
                  </button>
                  {(() => {
                    try {
                      const rxs = j.prescriptionsJson
                        ? (JSON.parse(j.prescriptionsJson) as Array<{ name: string; cost: number }>)
                        : null
                      if (rxs && rxs.length > 1) {
                        return <div className="text-xs text-muted-foreground max-w-44">{rxs.map((r) => r.name).join(', ')}</div>
                      }
                    } catch { /* fall through */ }
                    return <div className="text-xs text-muted-foreground truncate max-w-40">{j.medicationName}</div>
                  })()}
                  {j.prescriptionCost != null && (
                    <div className="text-xs font-medium text-green-700 dark:text-green-400">
                      ${j.prescriptionCost.toFixed(2)}
                      {(() => {
                        try {
                          const rxs = j.prescriptionsJson ? JSON.parse(j.prescriptionsJson) as Array<{ name: string }> : null
                          return rxs && rxs.length > 1 ? ` · ${rxs.length} Rx` : null
                        } catch { return null }
                      })()}
                    </div>
                  )}
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
                          <SelectItem value={j.callStatus} disabled>{formatCallStatus(j.callStatus)}</SelectItem>
                        )}
                        {EDITABLE_STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>{formatCallStatus(status)}</SelectItem>
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
                    ) : (j.patientResponse ?? '—')}
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
                      disabled={
                        j.validationStatus !== 'valid' ||
                        callingId === j.id ||
                        liveModeBlocked ||
                        aiModeBlocked ||
                        !canStartCall(j.callStatus)
                      }
                      onClick={() => onStart(j.id)}
                      title={
                        aiModeBlocked ? 'Set OPENAI_API_KEY for AI call mode'
                          : liveModeBlocked ? health?.liveCallReadiness?.issues.join(' ')
                          : !canStartCall(j.callStatus) ? 'Call already in progress or completed — use Retry'
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
                    >
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={callingId === j.id || isActiveCallStatus(j.callStatus)}
                      onClick={() => { if (window.confirm(`Delete ${j.patientName}?`)) onDelete(j.id) }}
                      title="Delete call job"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>

              {/* Expanded detail row — inline below patient */}
              {expandedId === j.id && (
                <tr key={`${j.id}-expanded`} className="border-b border-primary/20 bg-primary/[0.03]">
                  <td colSpan={9} className="px-2 pb-3">
                    <ExpandedRow job={j} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      {jobs.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  )
}
