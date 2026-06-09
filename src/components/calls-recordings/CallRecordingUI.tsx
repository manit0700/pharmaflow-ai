import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Pause,
  Phone,
  Play,
  RefreshCw,
  Search,
  TrendingUp,
  TriangleAlert,
  UserRoundCheck,
  Volume2,
  XCircle,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatDuration, formatTime } from '@/lib/utils'
import type { CallRecordingRecord, CallStatus, FollowUpAction, OutcomeFilter, Sentiment, WorkflowType } from '@/types/callRecordings'
import {
  createFollowUpFromCall,
  createStaffTask,
  fetchCallJobs,
  fetchHealth,
  resolveCallJob,
  scheduleRetryCall,
  updateCallJob,
  updateTask,
  type CallJob,
  type ScheduleRetryInput,
  type StaffTask,
} from '@/utils/api'
import { mergeRecordingSources } from '@/utils/callJobToRecording'
import { outcomeBadgeVariant, type FinalCallOutcome } from '@/utils/callOutcome'
import { RetryScheduleModal } from './RetryScheduleModal'
import {
  DATE_OPTIONS,
  OUTCOME_FILTER_OPTIONS,
  REVIEW_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  WORKFLOW_OPTIONS,
  filterAndSortCalls,
  type DateFilter,
  type ReviewFilter,
  type SortOption,
} from './CallRecordingHelpers'

const KEYWORDS = ['refill', 'prescription', 'delivery', 'insurance', 'prior authorization', 'consent', 'pickup', 'medication']

function labelStatus(status: CallStatus) {
  return status.replace(/_/g, ' ')
}

function statusVariant(status: CallStatus): 'success' | 'secondary' | 'destructive' | 'warning' {
  if (status === 'completed') return 'success'
  if (status === 'no_answer' || status === 'voicemail') return 'secondary'
  if (status === 'failed' || status === 'canceled') return 'destructive'
  if (status === 'busy') return 'warning'
  return 'warning'
}

function sentimentVariant(sentiment: Sentiment): 'success' | 'secondary' | 'warning' {
  if (sentiment === 'Positive') return 'success'
  if (sentiment === 'Neutral') return 'secondary'
  return 'warning'
}

function maskSpeaker(speaker: 'ai' | 'patient' | 'staff') {
  if (speaker === 'ai') return 'AI Assistant'
  if (speaker === 'staff') return 'Pharmacy Staff'
  return 'Patient'
}

function highlightKeywords(text: string) {
  const lower = text.toLowerCase()
  const hit = KEYWORDS.find((k) => lower.includes(k))
  if (!hit) return <>{text}</>
  const idx = lower.indexOf(hit)
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5">{text.slice(idx, idx + hit.length)}</mark>
      {text.slice(idx + hit.length)}
    </>
  )
}

function exportBlob(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function CallRecordingDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [calls, setCalls] = useState<CallRecordingRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | CallStatus>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all')
  const [workflow, setWorkflow] = useState<'all' | WorkflowType>('all')
  const [review, setReview] = useState<ReviewFilter>('all')
  const [date, setDate] = useState<DateFilter>('all')
  const [sort, setSort] = useState<SortOption>('newest')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)
  const [liveJobCount, setLiveJobCount] = useState(0)
  const [liveJobsById, setLiveJobsById] = useState<Record<string, CallJob>>({})
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [retryModalJob, setRetryModalJob] = useState<CallJob | null>(null)
  const [health, setHealth] = useState<import('@/utils/api').HealthResponse | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [progressSec, setProgressSec] = useState(0)

  useEffect(() => {
    const callId = searchParams.get('callId')
    if (callId && calls.some((c) => c.id === callId)) {
      setSelectedId(callId)
    }
  }, [searchParams, calls])

  const loadCalls = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setErrored(false)
    try {
      const [jobs, h] = await Promise.all([fetchCallJobs(), fetchHealth()])
      const byId = Object.fromEntries(jobs.map((job) => [job.id, job]))
      setLiveJobsById(byId)
      setLiveJobCount(jobs.length)
      setHealth(h)
      setCalls(mergeRecordingSources(jobs))
    } catch {
      setErrored(true)
      setCalls([])
      if (!silent) toast.error('Could not load call recordings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCalls()
  }, [loadCalls])

  const filtered = useMemo(
    () => filterAndSortCalls(calls, { search, status, workflow, review, date, sort, outcomeFilter }),
    [calls, search, status, workflow, review, date, sort, outcomeFilter],
  )

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null

  const metrics = useMemo(() => {
    const total = calls.length
    const completed = calls.filter((c) => c.status === 'completed').length
    const failed = calls.filter((c) => c.status === 'failed' || c.status === 'no_answer').length
    const followUp = calls.filter((c) => c.followUpNeeded).length
    const avg = Math.round(calls.reduce((acc, c) => acc + c.durationSec, 0) / Math.max(1, total))
    const successRate = Math.round((completed / Math.max(1, total)) * 100)
    return { total, completed, failed, followUp, avg, successRate }
  }, [calls])

  const workflowPerformance = useMemo(() => {
    return WORKFLOW_OPTIONS.map((wf) => {
      const subset = calls.filter((c) => c.workflow === wf)
      const success = subset.filter((c) => c.status === 'completed').length
      const pct = subset.length ? Math.round((success / subset.length) * 100) : 0
      return { workflow: wf, percent: pct }
    })
  }, [calls])

  const ensureFollowUpTask = useCallback(async (job: CallJob): Promise<StaffTask> => {
    const existing = job.staffTasks?.find((task) => task.status !== 'completed' && task.status !== 'cancelled')
    if (existing) return existing
    const result = await createFollowUpFromCall(job.id)
    return result.task
  }, [])

  const markCallReviewed = async (call: CallRecordingRecord) => {
    const job = liveJobsById[call.id]
    if (!job) {
      toast.error('This call is not saved in the database yet.')
      return
    }
    setActionBusy(call.id)
    try {
      await updateCallJob(call.id, {
        resolutionStatus: 'reviewed',
        staffNotes: 'Call recording reviewed by pharmacy staff.',
      })
      await loadCalls(true)
      toast.success('Call marked reviewed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark call reviewed')
    } finally {
      setActionBusy(null)
    }
  }

  const applyFollowup = async (action: FollowUpAction) => {
    if (!selected || !action) return
    const job = liveJobsById[selected.id]
    if (!job) {
      toast.error('This call is not saved in the database yet.')
      return
    }

    setActionBusy(selected.id)
    try {
      if (action === 'mark_reviewed') {
        await updateCallJob(selected.id, {
          resolutionStatus: 'reviewed',
          staffNotes: 'Call recording reviewed by pharmacy staff.',
        })
        toast.success('Call marked reviewed')
      } else if (action === 'mark_resolved') {
        await resolveCallJob(selected.id, { staffNotes: 'Resolved by pharmacy staff from call recording.' })
        toast.success('Call marked resolved')
      } else if (action === 'assign_pharmacist') {
        const task = await ensureFollowUpTask(job)
        await updateTask(task.id, {
          assignedTeam: 'Pharmacist',
          appendNote: 'Assigned to pharmacist from call recording.',
        })
        toast.success('Assigned to pharmacist')
      } else if (action === 'call_back_later') {
        const task = await ensureFollowUpTask(job)
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        await updateTask(task.id, {
          appendNote: 'Patient requested callback later.',
          dueDate: tomorrow.toISOString().slice(0, 10),
          dueTime: '14:00',
        })
        toast.success('Callback scheduled for tomorrow')
      } else if (action === 'create_pa_task') {
        const existingPa = job.staffTasks?.find(
          (task) => task.taskType === 'prior_auth' && task.status !== 'completed' && task.status !== 'cancelled',
        )
        if (existingPa) {
          navigate(`/follow-ups?task=${existingPa.id}`)
          toast.message('Existing PA task linked')
        } else {
          const created = await createStaffTask({
            patientName: job.patientName,
            phoneNumber: job.phoneNumber,
            taskType: 'prior_auth',
            callJobId: job.id,
            priority: 'high',
            assignedTeam: 'Billing Team',
            issueSummary: 'Prior authorization follow-up from call recording.',
            sourceWorkflow: 'PA Follow-up',
          })
          navigate(`/follow-ups?task=${created.id}`)
          toast.success('PA task created')
        }
      }
      await loadCalls(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save call action')
    } finally {
      setActionBusy(null)
    }
  }

  const openFollowUp = (call: CallRecordingRecord) => {
    if (call.relatedFollowUpTaskId) {
      navigate(`/follow-ups?task=${call.relatedFollowUpTaskId}`)
      return
    }
    navigate(`/follow-ups?callId=${call.id}`)
  }

  const handleRetryCall = (call: CallRecordingRecord) => {
    const job = liveJobsById[call.id]
    if (!job) {
      toast.message('Retry scheduling is available for live call jobs from Postgres.')
      return
    }
    setRetryModalJob(job)
  }

  const submitRetrySchedule = async (input: ScheduleRetryInput) => {
    if (!retryModalJob) return
    setActionBusy(retryModalJob.id)
    try {
      const result = await scheduleRetryCall(retryModalJob.id, input)
      toast.success(
        result.existing
          ? 'A retry is already scheduled for this call.'
          : input.placeImmediately
            ? 'Retry call initiated.'
            : 'Retry call scheduled.',
      )
      setRetryModalJob(null)
      await loadCalls(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry scheduling failed')
    } finally {
      setActionBusy(null)
    }
  }

  const handleCreateFollowUp = async (call: CallRecordingRecord) => {
    if (call.relatedFollowUpTaskId) {
      navigate(`/follow-ups?task=${call.relatedFollowUpTaskId}`)
      return
    }
    const job = liveJobsById[call.id]
    if (!job) {
      openFollowUp(call)
      return
    }
    setActionBusy(call.id)
    try {
      const result = await createFollowUpFromCall(job.id)
      toast.success(result.created ? 'Follow-up task created' : 'Existing follow-up task linked')
      await loadCalls(true)
      navigate(`/follow-ups?task=${result.task.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create follow-up task')
    } finally {
      setActionBusy(null)
    }
  }

  const refreshCalls = () => {
    void loadCalls()
  }

  const metricTrends = useMemo(
    () => ({
      total: metrics.total === 0 ? 'No calls recorded yet' : `${metrics.total} in call history`,
      completed:
        metrics.total > 0 ? `${Math.round((metrics.completed / metrics.total) * 100)}% of total volume` : '—',
      failed: metrics.failed > 0 ? 'Review retry and callback queue' : 'No failures in period',
      followUp: metrics.followUp > 0 ? `${metrics.followUp} need staff action` : 'No open follow-ups from calls',
      avg: metrics.avg > 0 ? 'Average completed call length' : '—',
      success: metrics.successRate > 0 ? 'Completed vs total calls' : '—',
    }),
    [metrics],
  )

  const exportLogs = () => {
    exportBlob('call-recording-logs.json', { generatedAt: new Date().toISOString(), records: filtered })
  }

  const selectedDuration = selected?.durationSec ?? 0
  const progressPct = selectedDuration ? Math.min(100, (progressSec / selectedDuration) * 100) : 0

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[420px]" />
      </div>
    )
  }

  if (errored) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="space-y-3 p-6 text-sm">
          <p className="font-medium">We hit a temporary error loading call recordings.</p>
          <p className="text-muted-foreground">Please retry after confirming the API and database are available.</p>
          <Button onClick={refreshCalls}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
          <p className="text-sm text-muted-foreground">
            Outbound call outcomes, transcripts, retry scheduling, and follow-up actions from your pharmacy queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportLogs}>
            <Download className="h-4 w-4" />
            Export Logs
          </Button>
          <Button variant="outline" onClick={refreshCalls}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-3 p-4">
          <p className="text-sm">
            <strong>PHI Protected Area</strong> — Call recordings and transcripts are for authorized pharmacy use only.
            Access is logged for compliance.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">PHI Protected</Badge>
            <Badge variant="secondary">Access Logged</Badge>
            <Badge variant="secondary">Phone Numbers Masked</Badge>
            <Badge variant="outline">Staff Review</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Use this area only for authorized pharmacy operations. Avoid exporting or sharing PHI outside approved workflows.
          </p>
          {liveJobCount > 0 && (
            <Badge variant="success" className="mt-1">
              {liveJobCount} call record{liveJobCount === 1 ? '' : 's'} loaded
            </Badge>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard icon={<Phone className="h-4 w-4" />} label="Total Calls" value={String(metrics.total)} trend={metricTrends.total} />
        <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed Calls" value={String(metrics.completed)} trend={metricTrends.completed} />
        <MetricCard icon={<XCircle className="h-4 w-4" />} label="No Answer / Failed" value={String(metrics.failed)} trend={metricTrends.failed} />
        <MetricCard icon={<TriangleAlert className="h-4 w-4" />} label="Follow-up Required" value={String(metrics.followUp)} trend={metricTrends.followUp} />
        <MetricCard icon={<Clock3 className="h-4 w-4" />} label="Average Duration" value={formatDuration(metrics.avg)} trend={metricTrends.avg} />
        <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Success Rate" value={`${metrics.successRate}%`} trend={metricTrends.success} />
      </section>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search patient, phone, workflow, or outcome"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <FilterSelect
              label="Status"
              value={status}
              onValue={(v) => setStatus(v as typeof status)}
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s === 'all' ? 'All' : labelStatus(s) }))}
            />
            <FilterSelect
              label="Outcome"
              value={outcomeFilter}
              onValue={(v) => setOutcomeFilter(v as OutcomeFilter)}
              options={OUTCOME_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <FilterSelect
              label="Workflow"
              value={workflow}
              onValue={(v) => setWorkflow(v as typeof workflow)}
              options={[{ value: 'all', label: 'All' }, ...WORKFLOW_OPTIONS.map((w) => ({ value: w, label: w }))]}
            />
            <FilterSelect
              label="Review"
              value={review}
              onValue={(v) => setReview(v as ReviewFilter)}
              options={REVIEW_OPTIONS.map((r) => ({
                value: r,
                label: r === 'all' ? 'All' : r === 'needs_review' ? 'Needs Review' : 'Reviewed',
              }))}
            />
            <FilterSelect
              label="Date"
              value={date}
              onValue={(v) => setDate(v as DateFilter)}
              options={DATE_OPTIONS.map((d) => ({
                value: d,
                label: d === 'all' ? 'All Time' : d === '7d' ? '7 Days' : d === '30d' ? '30 Days' : 'Today',
              }))}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-6">
            <div className="lg:col-span-2" />
            <div className="lg:col-span-2">
              <FilterSelect
                label="Sort"
                value={sort}
                onValue={(v) => setSort(v as SortOption)}
                options={SORT_OPTIONS.map((s) => ({
                  value: s,
                  label:
                    s === 'newest'
                      ? 'Newest First'
                      : s === 'oldest'
                        ? 'Oldest First'
                        : s === 'longest'
                          ? 'Longest Calls'
                          : s === 'failed_first'
                            ? 'Failed First'
                            : 'Needs Review First',
                }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No call recordings found.</p>
            <p className="text-sm text-muted-foreground">Place outbound calls or change filters to review call outcomes.</p>
          </CardContent>
        </Card>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call list</CardTitle>
              <CardDescription>Select a call to review transcript, outcome, and follow-up</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="hidden rounded-md border border-border/60 md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Patient</th>
                      <th className="px-3 py-2 text-left">Workflow</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Date/Time</th>
                      <th className="px-3 py-2 text-left">Duration</th>
                      <th className="px-3 py-2 text-left">AI Confidence</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((call) => (
                      <tr
                        key={call.id}
                        className={cn(
                          'cursor-pointer border-t border-border/60 hover:bg-muted/40',
                          selected?.id === call.id && 'bg-primary/10',
                        )}
                        onClick={() => setSelectedId(call.id)}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium">{call.patientMasked}</div>
                          <div className="text-xs text-muted-foreground">{call.phoneMasked}</div>
                          <div className="mt-1 flex gap-1">
                            <Badge variant={sentimentVariant(call.sentiment)}>{call.sentiment}</Badge>
                            <Badge variant={call.reviewed ? 'success' : 'warning'}>
                              {call.reviewed ? 'Reviewed' : 'Needs Review'}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-2">{call.workflow}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant(call.status)}>{labelStatus(call.status)}</Badge>
                          {call.finalOutcome && (
                            <Badge className="mt-1" variant={outcomeBadgeVariant(call.finalOutcome as FinalCallOutcome)}>
                              {call.finalOutcome}
                            </Badge>
                          )}
                          {call.twilioStatus && call.liveSource === 'api' && (
                            <Badge className="mt-1" variant="outline">
                              Twilio: {call.twilioStatus.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          {call.retryRecommendation?.shouldRetry && (
                            <Badge className="mt-1" variant="warning">
                              Retry recommended
                            </Badge>
                          )}
                          {call.followUpNeeded && <Badge className="mt-1" variant="warning">Follow-up</Badge>}
                        </td>
                        <td className="px-3 py-2">{formatTime(call.startedAt)}</td>
                        <td className="px-3 py-2">{formatDuration(call.durationSec)}</td>
                        <td className="px-3 py-2">{call.aiConfidence != null ? `${call.aiConfidence}%` : '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedId(call.id); setPlaying(true) }}>
                              <Play className="h-3 w-3" />
                              Play
                            </Button>
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedId(call.id); setDrawerOpen(true) }}>
                              <FileText className="h-3 w-3" />
                              Transcript
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={actionBusy === call.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                void markCallReviewed(call)
                              }}
                            >
                              <UserRoundCheck className="h-3 w-3" />
                              Reviewed
                            </Button>
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); exportBlob(`call-${call.id}.json`, call) }}>
                              <Download className="h-3 w-3" />
                              Export
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 md:hidden">
                {filtered.map((call) => (
                  <Card
                    key={call.id}
                    className={cn('cursor-pointer border-border/70', selected?.id === call.id && 'border-primary bg-primary/5')}
                    onClick={() => setSelectedId(call.id)}
                  >
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{call.patientMasked}</p>
                          <p className="text-xs text-muted-foreground">{call.phoneMasked}</p>
                        </div>
                        <Badge variant={statusVariant(call.status)}>{labelStatus(call.status)}</Badge>
                      </div>
                      <p className="text-sm">{call.workflow}</p>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>{formatTime(call.startedAt)}</span>
                        <span>•</span>
                        <span>{formatDuration(call.durationSec)}</span>
                        <span>•</span>
                        <span>{call.aiConfidence}% confidence</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={sentimentVariant(call.sentiment)}>{call.sentiment}</Badge>
                        <Badge variant={call.reviewed ? 'success' : 'warning'}>{call.reviewed ? 'Reviewed' : 'Needs Review'}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-sm">Mini analytics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {workflowPerformance.map((item) => (
                      <div key={item.workflow} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{item.workflow}</span>
                          <span>{item.percent}% success</span>
                        </div>
                        <div className="h-2 rounded bg-muted">
                          <div className="h-2 rounded bg-primary" style={{ width: `${item.percent}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Selected call</CardTitle>
              <CardDescription>Playback, transcript preview, and follow-up controls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selected ? (
                <p className="text-sm text-muted-foreground">Select a call from the list.</p>
              ) : (
                <>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{selected.patientMasked}</p>
                      <Badge variant={statusVariant(selected.status)}>{labelStatus(selected.status)}</Badge>
                    </div>
                    <p className="text-muted-foreground">{selected.phoneMasked}</p>
                    <p>{selected.workflow}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        <CalendarDays className="mr-1 h-3 w-3" />
                        {formatTime(selected.startedAt)}
                      </Badge>
                      <Badge variant="outline">{formatDuration(selected.durationSec)}</Badge>
                      <Badge variant={sentimentVariant(selected.sentiment)}>{selected.sentiment}</Badge>
                      {selected.aiConfidence != null && (
                        <Badge variant="secondary">AI Confidence {selected.aiConfidence}%</Badge>
                      )}
                      {selected.finalOutcome && (
                        <Badge variant={outcomeBadgeVariant(selected.finalOutcome as FinalCallOutcome)}>
                          {selected.finalOutcome}
                        </Badge>
                      )}
                      {selected.retryRecommendation?.shouldRetry && (
                        <Badge variant="warning">Retry recommended</Badge>
                      )}
                    </div>
                    <p className="text-sm">{selected.outcome}</p>
                    {selected.errorMessage && (
                      <p className="text-xs text-destructive">{selected.errorMessage}</p>
                    )}
                    {selected.retryRecommendation && (
                      <p className="text-xs text-muted-foreground">
                        {selected.retryRecommendation.reason} · {selected.retryRecommendation.nextActionLabel}
                      </p>
                    )}
                  </div>

                  {(selected.liveSource === 'api' || selected.followUpNeeded || selected.retryRecommendation?.shouldRetry) && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Call actions</CardTitle>
                        <CardDescription>Retry or create a follow-up task from this call outcome</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {selected.retryRecommendation?.shouldRetry && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionBusy === selected.id || !liveJobsById[selected.id]}
                            onClick={() => handleRetryCall(selected)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Schedule retry
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => void handleCreateFollowUp(selected)}
                          disabled={actionBusy === selected.id}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {selected.relatedFollowUpTaskId ? 'Open follow-up task' : 'Create follow-up task'}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {selected.liveSource === 'api' && liveJobsById[selected.id]?.retryHistory && liveJobsById[selected.id]!.retryHistory!.length > 0 && (
                    <Card className="border-border/70">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Retry history</CardTitle>
                        <CardDescription>Original attempt and scheduled retries for this call chain</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {liveJobsById[selected.id]!.retryHistory!.map((entry) => (
                          <div key={entry.id} className="rounded-md border border-border/60 p-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">
                                Attempt {entry.retryAttempt || 'original'} · {entry.finalOutcome}
                              </span>
                              <Badge variant="outline">{entry.retryStatus || entry.callStatus}</Badge>
                            </div>
                            {entry.scheduledFor && (
                              <p className="mt-1 text-muted-foreground">
                                Scheduled: {new Date(entry.scheduledFor).toLocaleString()}
                              </p>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border-border/70">
                    <CardContent className="space-y-3 p-3">
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Audio player</span>
                      </div>
                      <div className="h-14 rounded bg-muted p-2">
                        <div className="flex h-full items-end gap-1">
                          {Array.from({ length: 40 }).map((_, i) => (
                            <div
                              key={i}
                              className="w-1 rounded bg-primary/60"
                              style={{ height: `${20 + ((i * 13) % 70)}%` }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="h-2 rounded bg-muted">
                        <div className="h-2 rounded bg-primary transition-all" style={{ width: `${progressPct}%` }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setPlaying((p) => !p)
                            if (!playing) {
                              setProgressSec((s) => Math.min(selected.durationSec, s + 15))
                            }
                          }}
                        >
                          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          {playing ? 'Pause' : 'Play'}
                        </Button>
                        <div className="flex gap-1">
                          {[1, 1.25, 1.5].map((speed) => (
                            <Button
                              key={speed}
                              size="sm"
                              variant={playbackSpeed === speed ? 'default' : 'outline'}
                              onClick={() => setPlaybackSpeed(speed)}
                            >
                              {speed}x
                            </Button>
                          ))}
                        </div>
                        <div className="ml-auto text-xs text-muted-foreground">
                          {formatDuration(Math.round(progressSec))} / {formatDuration(selected.durationSec)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/70">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Transcript preview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selected.transcript.slice(0, 4).map((line, idx) => (
                        <div key={`${line.time}-${idx}`} className="rounded-md border border-border/60 p-2 text-sm">
                          <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                            {maskSpeaker(line.speaker)} • {line.time}
                          </p>
                          <p>{highlightKeywords(line.text)}</p>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
                        View Full Transcript
                      </Button>
                    </CardContent>
                  </Card>

                  {selected.followUpNeeded && (
                    <Card className="border-warning/40 bg-warning/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Follow-up actions</CardTitle>
                        <CardDescription>Call marked for staff review</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => openFollowUp(selected)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open Follow-Up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionBusy === selected.id}
                          onClick={() => void applyFollowup('mark_reviewed')}
                        >
                          Mark Reviewed
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionBusy === selected.id}
                          onClick={() => void applyFollowup('assign_pharmacist')}
                        >
                          Assign to Pharmacist
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionBusy === selected.id}
                          onClick={() => void applyFollowup('call_back_later')}
                        >
                          Call Back Later
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionBusy === selected.id}
                          onClick={() => void applyFollowup('create_pa_task')}
                        >
                          Create PA Task
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionBusy === selected.id}
                          onClick={() => void applyFollowup('mark_resolved')}
                        >
                          Mark Resolved
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {drawerOpen && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Full transcript"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Full Transcript</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.patientMasked} · {selected.workflow} · {formatTime(selected.startedAt)}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
                Close
              </Button>
            </div>

            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-sm font-semibold">Transcript</h3>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  {selected.transcript.map((line, idx) => (
                    <div key={`${line.time}-${idx}`} className="text-sm">
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                        {maskSpeaker(line.speaker)} • {line.time}
                      </p>
                      <p>{highlightKeywords(line.text)}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">AI Summary</h3>
                <p className="rounded-md border border-border/60 p-3 text-sm">{selected.summary}</p>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Follow-Up Recommendation</h3>
                <p className="rounded-md border border-border/60 p-3 text-sm">{selected.recommendation}</p>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/60 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Outcome</p>
                  <p className="mt-1 text-sm">{selected.outcome}</p>
                </div>
                <div className="rounded-md border border-border/60 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Sentiment</p>
                  <p className="mt-1 text-sm">{selected.sentiment}</p>
                </div>
              </section>

              <section className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Compliance Details</p>
                <p className="mt-1 text-sm">
                  PHI Protected · Access Logged · Masked identifiers only.
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {selected.keyTags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      <RetryScheduleModal
        open={Boolean(retryModalJob)}
        job={retryModalJob}
        health={health}
        busy={Boolean(retryModalJob && actionBusy === retryModalJob.id)}
        onClose={() => setRetryModalJob(null)}
        onSubmit={submitRetrySchedule}
      />
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: React.ReactNode
  label: string
  value: string
  trend: string
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{trend}</p>
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  label,
  value,
  onValue,
  options,
}: {
  label: string
  value: string
  onValue: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onValue}>
        <SelectTrigger>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
