import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchCallJobs, type CallJob } from '@/utils/api'
import { Search, X, Users, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive'

interface RefillBadge {
  label: string
  variant: BadgeVariant
  pulse?: boolean
}

function getRefillBadge(job: CallJob): RefillBadge {
  const status = job.callStatus ?? ''
  const response = (job.patientResponse ?? '').toLowerCase()

  if (status === 'queued' || status === 'queued_live') {
    return { label: 'Pending', variant: 'secondary' }
  }
  if (status === 'in_progress') {
    return { label: 'Calling...', variant: 'default', pulse: true }
  }
  if (status === 'no_answer' || status === 'voicemail') {
    return { label: 'No Answer', variant: 'outline' }
  }
  if (job.staffFollowUpNeeded) {
    return { label: 'Staff Review', variant: 'destructive' }
  }
  if (response.includes('confirmed') || response.includes('process today') || response.includes('pick up today')) {
    return { label: 'Confirmed', variant: 'default' }
  }
  if (response.includes('not ready') || response.includes('declined')) {
    return { label: 'Declined', variant: 'destructive' }
  }
  if (response.includes('already')) {
    return { label: 'Already Done', variant: 'secondary' }
  }
  if (status === 'completed' && response) {
    return { label: 'Resolved', variant: 'default' }
  }
  return { label: 'Unknown', variant: 'outline' }
}

// ─── Grouping ────────────────────────────────────────────────────────────────

interface PatientRecord {
  key: string
  patientName: string
  phoneNumber: string
  medicationName: string
  latestJob: CallJob
  jobs: CallJob[]
  callReason: string
}

function groupByPatient(jobs: CallJob[]): PatientRecord[] {
  const map = new Map<string, CallJob[]>()
  for (const job of jobs) {
    const key = `${job.patientName.trim().toLowerCase()}|${job.phoneNumber.trim()}`
    const existing = map.get(key)
    if (existing) {
      existing.push(job)
    } else {
      map.set(key, [job])
    }
  }

  return Array.from(map.entries()).map(([key, patientJobs]) => {
    const sorted = [...patientJobs].sort(
      (a, b) =>
        new Date(b.callAttemptedAt ?? b.createdAt).getTime() -
        new Date(a.callAttemptedAt ?? a.createdAt).getTime(),
    )
    const latest = sorted[0]
    return {
      key,
      patientName: latest.patientName,
      phoneNumber: latest.phoneNumber,
      medicationName: latest.medicationName,
      latestJob: latest,
      jobs: sorted,
      callReason: latest.callReason,
    }
  })
}

// ─── Filter type ─────────────────────────────────────────────────────────────

type ReasonFilter = 'all' | 'refill_reminder' | 'pickup_reminder' | 'needs_follow_up'

const REASON_LABELS: Record<ReasonFilter, string> = {
  all: 'All',
  refill_reminder: 'Refill reminder',
  pickup_reminder: 'Pickup reminder',
  needs_follow_up: 'Needs follow-up',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PatientsPage() {
  const [jobs, setJobs] = useState<CallJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('all')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const load = useCallback(async () => {
    try {
      const data = await fetchCallJobs()
      setJobs(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0)
    const interval = setInterval(() => { void load() }, 15_000)
    return () => {
      window.clearTimeout(timeoutId)
      clearInterval(interval)
    }
  }, [load])

  const patients = useMemo(() => groupByPatient(jobs), [jobs])

  const filtered = useMemo(() => {
    let result = patients

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.patientName.toLowerCase().includes(q) ||
          p.phoneNumber.toLowerCase().includes(q) ||
          p.medicationName.toLowerCase().includes(q),
      )
    }

    if (reasonFilter === 'refill_reminder') {
      result = result.filter((p) =>
        p.callReason.toLowerCase().includes('refill'),
      )
    } else if (reasonFilter === 'pickup_reminder') {
      result = result.filter((p) =>
        p.callReason.toLowerCase().includes('pickup') ||
        p.callReason.toLowerCase().includes('pick up'),
      )
    } else if (reasonFilter === 'needs_follow_up') {
      result = result.filter((p) => p.latestJob.staffFollowUpNeeded)
    }

    return result
  }, [patients, search, reasonFilter])

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${patients.length} patient${patients.length === 1 ? '' : 's'} tracked across all call jobs`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Patients card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Patient refill tracking
              </CardTitle>
              <CardDescription>
                {loading ? 'Loading patients…' : `${filtered.length} of ${patients.length} patients shown`}
              </CardDescription>
            </div>

            {/* Search + filter */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, phone, medication…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-56 pl-8 text-sm"
                />
                {search && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2"
                    onClick={() => setSearch('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <Select
                value={reasonFilter}
                onValueChange={(v) => setReasonFilter(v as ReasonFilter)}
              >
                <SelectTrigger className="h-8 w-44 text-sm">
                  <SelectValue placeholder="Filter by reason" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REASON_LABELS) as ReasonFilter[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {REASON_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">
                {patients.length === 0 ? 'No patients found' : 'No patients match your filters'}
              </p>
              {patients.length === 0 && (
                <p className="text-xs">Import an Excel file or add a patient manually on the Dashboard.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="pb-2 pr-4">Patient</th>
                    <th className="pb-2 pr-4">Phone</th>
                    <th className="pb-2 pr-4">Medication</th>
                    <th className="pb-2 pr-4">Last Called</th>
                    <th className="pb-2 pr-4">Refill Status</th>
                    <th className="pb-2 pr-4 w-8"><span className="sr-only">History</span></th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((patient) => {
                    const badge = getRefillBadge(patient.latestJob)
                    const lastCalled = patient.latestJob.callAttemptedAt ?? patient.latestJob.createdAt
                    const isExpanded = expandedKeys.has(patient.key)
                    return (
                      <Fragment key={patient.key}>
                        <tr className="hover:bg-muted/40 transition-colors">
                          <td className="py-2.5 pr-4 font-medium">{patient.patientName}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{patient.phoneNumber}</td>
                          <td className="py-2.5 pr-4">{patient.medicationName}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">
                            {relativeTime(lastCalled)}
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge
                              variant={badge.variant}
                              className={badge.pulse ? 'animate-pulse' : ''}
                            >
                              {badge.label}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleExpanded(patient.key)}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? 'Hide call history' : 'Show call history'}
                              title={`${patient.jobs.length} call${patient.jobs.length === 1 ? '' : 's'}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                asChild
                              >
                                <a href={`tel:${patient.phoneNumber}`}>Call</a>
                              </Button>
                              {patient.latestJob.aiSummary && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  title={patient.latestJob.aiSummary}
                                >
                                  Summary
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/20">
                            <td colSpan={7} className="px-4 py-3">
                              <p className="mb-2 text-xs font-medium text-muted-foreground">
                                Call history · {patient.jobs.length} call{patient.jobs.length === 1 ? '' : 's'}
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border/60 text-left font-medium text-muted-foreground">
                                    <th className="pb-1.5 pr-4">Date</th>
                                    <th className="pb-1.5 pr-4">Status</th>
                                    <th className="pb-1.5 pr-4">Duration</th>
                                    <th className="pb-1.5 pr-4">Patient Response</th>
                                    <th className="pb-1.5">Medication</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                  {patient.jobs.map((job) => {
                                    const jobBadge = getRefillBadge(job)
                                    return (
                                      <tr key={job.id}>
                                        <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">
                                          {formatDateTime(job.callAttemptedAt ?? job.createdAt)}
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          <Badge
                                            variant={jobBadge.variant}
                                            className={jobBadge.pulse ? 'animate-pulse' : ''}
                                          >
                                            {jobBadge.label}
                                          </Badge>
                                        </td>
                                        <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">
                                          {formatDuration(job.callDuration)}
                                        </td>
                                        <td className="py-1.5 pr-4 text-muted-foreground">
                                          {job.patientResponse ?? '—'}
                                        </td>
                                        <td className="py-1.5">{job.medicationName}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
