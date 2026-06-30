import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/components/shared/KpiCard'
import { AddPatientForm } from '@/components/calls/AddPatientForm'
import { CallJobsTable } from '@/components/calls/CallJobsTable'
import { CallOpsToolbar } from '@/components/calls/CallOpsToolbar'
import { CallStatusBanners } from '@/components/calls/CallStatusBanners'
import { ActiveCallsPanel } from '@/components/calls/ActiveCallsPanel'
import { useCallOperations } from '@/hooks/useCallOperations'
import type { KPIStat } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, ExternalLink, Search, X } from 'lucide-react'

export function DashboardPage() {
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  const {
    health,
    jobs,
    tasks,
    loading,
    callingId,
    updatingStatusIds,
    activeJobs,
    refresh,
    onUpload,
    onCreate,
    onStart,
    onRetry,
    onScheduleQueued,
    onDelete,
    onUpdateStatus,
    queued,
    completed,
    invalid,
    needsReview,
  } = useCallOperations()

  const kpis: KPIStat[] = [
    {
      id: 'queue',
      label: 'In queue',
      value: String(queued.length),
      change: `${jobs.length} total jobs`,
      trend: 'neutral',
    },
    {
      id: 'completed',
      label: 'Completed calls',
      value: String(completed.length),
      change: completed.length > 0 ? 'Ready for export' : 'No completions yet',
      trend: completed.length > 0 ? 'up' : 'neutral',
    },
    {
      id: 'valid',
      label: 'Valid patients',
      value: String(jobs.filter((j) => j.validationStatus === 'valid').length),
      change: needsReview.length > 0
        ? `${needsReview.length} need manual review`
        : invalid.length > 0
          ? `${invalid.length} invalid rows`
          : 'All rows valid',
      trend: needsReview.length > 0 || invalid.length > 0 ? 'down' : 'up',
    },
    {
      id: 'tasks',
      label: 'Staff follow-ups',
      value: String(tasks.length),
      change: tasks.length > 0 ? 'Needs attention' : 'No open tasks',
      trend: tasks.length > 0 ? 'down' : 'neutral',
    },
  ]

  const filteredJobs = search.trim()
    ? jobs.filter((j) => {
        const q = search.toLowerCase()
        return (
          j.patientName.toLowerCase().includes(q) ||
          j.phoneNumber.toLowerCase().includes(q) ||
          j.medicationName.toLowerCase().includes(q)
        )
      })
    : jobs

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {queued.length} patient{queued.length === 1 ? '' : 's'} in queue ·{' '}
            <Link to="/conversations" className="text-primary hover:underline underline-offset-2">
              {completed.length} completed
            </Link>
          </p>
        </div>
        <CallOpsToolbar
          health={health}
          loading={loading}
          onRefresh={() => void refresh()}
          onUpload={onUpload}
          onSchedule={(isoDate) => void onScheduleQueued(isoDate)}
        />
      </div>

      <CallStatusBanners health={health} loading={loading} />

      <ActiveCallsPanel jobs={activeJobs} health={health} callingId={callingId} />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && jobs.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))
          : kpis.map((k) => <KpiCard key={k.id} stat={k} />)}
      </div>

      {/* Staff follow-ups — only shown when there are open tasks */}
      {tasks.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Staff follow-ups</CardTitle>
                <Badge variant="warning">{tasks.length}</Badge>
              </div>
              <Link to="/follow-ups">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                  View all <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            <CardDescription>Escalations requiring pharmacy staff attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {tasks.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <div>
                  <span className="font-medium">{t.patientName}</span>
                  <span className="ml-2 text-xs text-muted-foreground capitalize">{t.taskType.replace(/_/g, ' ')}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
              </div>
            ))}
            {tasks.length > 5 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{tasks.length - 5} more ·{' '}
                <Link to="/follow-ups" className="text-primary underline underline-offset-2">View all</Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Call jobs table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Call jobs</CardTitle>
              <CardDescription>
                {filteredJobs.length !== jobs.length
                  ? `${filteredJobs.length} of ${jobs.length} patients`
                  : `${jobs.length} patient${jobs.length === 1 ? '' : 's'}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search patient, phone, medication…"
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
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setShowAddForm((v) => !v)}
              >
                {showAddForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Add patient
              </Button>
              <Link
                to="/calls?mode=real"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Import Excel →
              </Link>
            </div>
          </div>

          {showAddForm && (
            <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Phone number, DOB, medication, and call reason — same fields as Excel import
              </p>
              <AddPatientForm
                disabled={!health?.ok}
                onSubmit={async (input) => {
                  await onCreate(input)
                  setShowAddForm(false)
                }}
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <CallJobsTable
            jobs={filteredJobs}
            callingId={callingId}
            health={health}
            onStart={(id) => void onStart(id)}
            onRetry={(id) => void onRetry(id)}
            onDelete={(id) => void onDelete(id)}
            onUpdateStatus={(id, status) => void onUpdateStatus(id, status)}
            updatingStatusIds={updatingStatusIds}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Link to="/conversations" className="text-primary underline">Call history</Link>
        {' · '}
        <Link to="/workflows" className="text-primary underline">Call flow</Link>
        {' · '}
        <Link to="/integrations" className="text-primary underline">Integrations</Link>
        {' · '}
        <Link to="/analytics" className="text-primary underline">Analytics</Link>
      </p>
    </div>
  )
}
