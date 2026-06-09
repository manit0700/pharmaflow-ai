import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { fetchAnalytics, type AnalyticsResponse } from '@/utils/api'

function OwnerOverview({ analytics }: { analytics: AnalyticsResponse | null }) {
  const metrics = analytics?.metrics
  const attentionCount = analytics?.managerAttention.length ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Owner overview</CardTitle>
            <CardDescription>Call performance and follow-up workload at a glance</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/analytics">Open analytics</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {metrics ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Completion rate</p>
              <p className="mt-1 text-xl font-semibold">{metrics.successRate}%</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Open follow-ups</p>
              <p className="mt-1 text-xl font-semibold">{metrics.openFollowUpTasks}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Overdue tasks</p>
              <p className={metrics.overdueFollowUpTasks > 0 ? 'mt-1 text-xl font-semibold text-destructive' : 'mt-1 text-xl font-semibold'}>
                {metrics.overdueFollowUpTasks}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Today’s attention</p>
              <p className={attentionCount > 0 ? 'mt-1 text-xl font-semibold text-warning' : 'mt-1 text-xl font-semibold'}>
                {attentionCount}
              </p>
            </div>
          </div>
        ) : (
          <Skeleton className="h-20 rounded-md" />
        )}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const [ownerAnalytics, setOwnerAnalytics] = useState<AnalyticsResponse | null>(null)
  const {
    health,
    jobs,
    tasks,
    loading,
    callingId,
    activeJobs,
    refresh,
    onUpload,
    onCreate,
    onStart,
    onRetry,
    onPreviewScript,
    onSaveNotes,
    onUpdateExistingJob,
    onResolve,
    onAddDoNotCall,
    queued,
    completed,
    invalid,
  } = useCallOperations()

  useEffect(() => {
    fetchAnalytics({ range: '7d' })
      .then(setOwnerAnalytics)
      .catch(() => setOwnerAnalytics(null))
  }, [])

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
      change: invalid.length > 0 ? `${invalid.length} need review` : 'All rows valid',
      trend: invalid.length > 0 ? 'down' : 'up',
    },
    {
      id: 'tasks',
      label: 'Staff follow-ups',
      value: String(tasks.length),
      change: tasks.length > 0 ? 'From escalations' : 'No open tasks',
      trend: tasks.length > 0 ? 'down' : 'neutral',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {queued.length} patient{queued.length === 1 ? '' : 's'} in queue · outbound calls and follow-up workload
          </p>
        </div>
        <CallOpsToolbar
          health={health}
          loading={loading}
          onRefresh={() => void refresh()}
          onUpload={onUpload}
        />
      </div>

      <CallStatusBanners health={health} loading={loading} />

      <ActiveCallsPanel jobs={activeJobs} health={health} callingId={callingId} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && jobs.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))
          : kpis.map((k) => <KpiCard key={k.id} stat={k} />)}
      </div>

      <OwnerOverview analytics={ownerAnalytics} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add patient manually</CardTitle>
          <CardDescription>
            Enter phone number, DOB, medication, and call reason — same fields as Excel import
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddPatientForm
            disabled={!health?.ok}
            onSubmit={async (input) => onCreate(input)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Call jobs</CardTitle>
              <CardDescription>{jobs.length} patients in queue</CardDescription>
            </div>
            <Link
              to="/calls?mode=real"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Full import view →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <CallJobsTable
            jobs={jobs}
            callingId={callingId}
            health={health}
            onStart={(id) => void onStart(id)}
            onRetry={(id) => void onRetry(id)}
            onPreviewScript={onPreviewScript}
            onSaveNotes={(id, notes) => void onSaveNotes(id, notes)}
            onUpdateJob={(job, data) => void onUpdateExistingJob(job, data)}
            onResolve={(id, notes) => void onResolve(id, notes)}
            onAddDoNotCall={(job) => void onAddDoNotCall(job)}
          />
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff follow-ups</CardTitle>
            <CardDescription>Escalations requiring pharmacy staff</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {tasks.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="font-medium">{t.patientName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground capitalize">{t.taskType.replace(/_/g, ' ')}</span>
                  <Badge variant="outline">{t.priority}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
