import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  FileWarning,
  ListChecks,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatDuration } from '@/lib/utils'
import {
  fetchAnalytics,
  type AnalyticsBucket,
  type AnalyticsResponse,
  type AnalyticsTaskRow,
  type ManagerAttentionItem,
  type WorkflowAnalyticsRow,
} from '@/utils/api'

const emptyAnalytics: AnalyticsResponse = {
  generatedAt: new Date().toISOString(),
  range: '14d',
  workflowFilter: null,
  metrics: {
    totalCallJobs: 0,
    attemptedCalls: 0,
    completedCalls: 0,
    answeredCalls: 0,
    failedCalls: 0,
    noAnswerCalls: 0,
    voicemailCalls: 0,
    escalatedCalls: 0,
    callbackRequestedCalls: 0,
    followUpRequiredCalls: 0,
    openFollowUpTasks: 0,
    overdueFollowUpTasks: 0,
    completedFollowUpTasks: 0,
    cancelledFollowUpTasks: 0,
    averageCallDurationSeconds: null,
    averageAiConfidence: null,
    successRate: 0,
    answerRate: 0,
    followUpRate: 0,
    escalationRate: 0,
  },
  workflowBreakdown: [],
  taskMetrics: {
    tasksByStatus: [],
    tasksByPriority: [],
    tasksByType: [],
    tasksByAssignedTeam: [],
    urgentTasks: [],
    oldestOpenTasks: [],
    dueTodayTasks: 0,
    overdueTasks: 0,
  },
  trend: [],
  managerAttention: [],
}

const rangeOptions = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
]

function labelize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function percent(value: number): string {
  return `${Number.isFinite(value) ? value : 0}%`
}

function numberValue(value: number | null): string {
  return value == null ? '—' : value.toLocaleString()
}

function durationValue(seconds: number | null): string {
  return seconds == null ? '—' : formatDuration(seconds)
}

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value)
  return `"${raw.replace(/"/g, '""')}"`
}

function exportAnalyticsCsv(data: AnalyticsResponse) {
  const rows = [
    ['section', 'metric', 'value', 'generated_at'],
    ['summary', 'calls_attempted', data.metrics.attemptedCalls, data.generatedAt],
    ['summary', 'completion_rate', data.metrics.successRate, data.generatedAt],
    ['summary', 'answer_rate', data.metrics.answerRate, data.generatedAt],
    ['summary', 'follow_ups_created', data.metrics.followUpRequiredCalls, data.generatedAt],
    ['summary', 'open_tasks', data.metrics.openFollowUpTasks, data.generatedAt],
    ['summary', 'overdue_tasks', data.metrics.overdueFollowUpTasks, data.generatedAt],
    ['summary', 'escalations', data.metrics.escalatedCalls, data.generatedAt],
    ['summary', 'average_call_duration_seconds', data.metrics.averageCallDurationSeconds ?? '', data.generatedAt],
    ...data.workflowBreakdown.map((w) => [
      'workflow',
      w.workflow,
      `total=${w.total};completed=${w.completed};successRate=${w.successRate};followUps=${w.followUpsCreated}`,
      data.generatedAt,
    ]),
  ]
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pharmaflow-owner-analytics-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'default',
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  helper: string
  tone?: 'default' | 'success' | 'warning' | 'destructive'
}) {
  return (
    <Card>
      <CardContent className="flex min-h-28 items-start gap-3 p-4">
        <div
          className={cn(
            'rounded-md border p-2',
            tone === 'success' && 'border-success/30 bg-success/10 text-success',
            tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
            tone === 'destructive' && 'border-destructive/30 bg-destructive/10 text-destructive',
            tone === 'default' && 'border-border bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function AttentionCard({ item }: { item: ManagerAttentionItem }) {
  const Icon = item.severity === 'critical' ? ShieldAlert : item.severity === 'warning' ? AlertTriangle : ListChecks
  return (
    <Card
      className={cn(
        'border-l-4',
        item.severity === 'critical' && 'border-l-destructive',
        item.severity === 'warning' && 'border-l-warning',
        item.severity === 'info' && 'border-l-primary',
      )}
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Icon
            className={cn(
              'mt-0.5 h-5 w-5 shrink-0',
              item.severity === 'critical' && 'text-destructive',
              item.severity === 'warning' && 'text-warning',
              item.severity === 'info' && 'text-primary',
            )}
          />
          <div className="min-w-0">
            <p className="font-medium">{item.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={item.targetRoute}>{item.actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function BreakdownCard({ title, description, rows }: { title: string; description: string; rows: AnalyticsBucket[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length > 0 ? (
          rows.map((row) => <BarRow key={row.key} label={labelize(row.key)} value={row.count} max={max} />)
        ) : (
          <p className="text-sm text-muted-foreground">No data for this period.</p>
        )}
      </CardContent>
    </Card>
  )
}

function WorkflowTable({ rows }: { rows: WorkflowAnalyticsRow[] }) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No workflow data yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Workflow</th>
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Completed</th>
            <th className="px-4 py-3 font-medium">No answer</th>
            <th className="px-4 py-3 font-medium">Failed</th>
            <th className="px-4 py-3 font-medium">Follow-ups</th>
            <th className="px-4 py-3 font-medium">Success</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.callReason} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{row.workflow}</td>
              <td className="px-4 py-3">{row.total}</td>
              <td className="px-4 py-3">{row.completed}</td>
              <td className="px-4 py-3">{row.noAnswer}</td>
              <td className="px-4 py-3">{row.failed}</td>
              <td className="px-4 py-3">{row.followUpsCreated}</td>
              <td className="px-4 py-3">
                <Badge variant={row.successRate >= 75 ? 'success' : row.successRate >= 50 ? 'warning' : 'secondary'}>
                  {percent(row.successRate)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskTable({ title, rows }: { title: string; rows: AnalyticsTaskRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 0 ? (
          rows.map((task) => (
            <div key={task.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{labelize(task.taskType)}</p>
                <Badge variant={task.priority === 'urgent' ? 'destructive' : task.priority === 'high' ? 'warning' : 'outline'}>
                  {task.priority}
                </Badge>
              </div>
              <p className="mt-1 break-words text-sm text-muted-foreground">{task.issueSummary}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{task.assignedTeam}</span>
                {task.ageDays != null && <span>{task.ageDays}d old</span>}
                {task.dueDate && <span>Due {task.dueDate}</span>}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No tasks in this section.</p>
        )}
      </CardContent>
    </Card>
  )
}

export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRange] = useState(searchParams.get('range') ?? '14d')
  const [workflow, setWorkflow] = useState(searchParams.get('workflow') ?? 'all')
  const [data, setData] = useState<AnalyticsResponse>(emptyAnalytics)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchAnalytics({ range, workflow: workflow === 'all' ? undefined : workflow })
      setData(next)
      const params = new URLSearchParams()
      if (range !== '14d') params.set('range', range)
      if (workflow !== 'all') params.set('workflow', workflow)
      setSearchParams(params, { replace: true })
    } catch (err) {
      setData(emptyAnalytics)
      setError(err instanceof Error ? err.message : 'Could not load analytics.')
    } finally {
      setLoading(false)
    }
  }, [range, setSearchParams, workflow])

  useEffect(() => {
    void load()
  }, [load])

  const workflowOptions = useMemo(
    () => [
      { value: 'all', label: 'All workflows' },
      ...data.workflowBreakdown.map((row) => ({ value: row.callReason, label: row.workflow })),
    ],
    [data.workflowBreakdown],
  )

  const trend = data.trend.map((row) => ({ ...row, label: row.date.slice(5) }))
  const hasData = data.metrics.totalCallJobs > 0 || data.metrics.openFollowUpTasks > 0 || data.workflowBreakdown.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Owner Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track outbound call performance, follow-up workload, and pharmacy team activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => exportAnalyticsCsv(data)} disabled={!hasData}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button asChild variant="outline">
            <Link to="/follow-ups">View Follow-Ups</Link>
          </Button>
          <Button asChild>
            <Link to="/calls">View Calls</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_220px_1fr]">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger>
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            {rangeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={workflow} onValueChange={setWorkflow}>
          <SelectTrigger>
            <SelectValue placeholder="Workflow" />
          </SelectTrigger>
          <SelectContent>
            {workflowOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="self-center text-xs text-muted-foreground">
          Analytics are aggregate-first and do not include DOB, full medication details, or unmasked phone numbers.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {error && (
            <Card className="border-destructive/40">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={PhoneCall} label="Calls Attempted" value={numberValue(data.metrics.attemptedCalls)} helper={`${data.metrics.totalCallJobs} jobs in range`} />
            <MetricCard icon={CheckCircle2} label="Completion Rate" value={percent(data.metrics.successRate)} helper={`${data.metrics.completedCalls} completed calls`} tone="success" />
            <MetricCard icon={Users} label="Answer Rate" value={percent(data.metrics.answerRate)} helper={`${data.metrics.answeredCalls} patient answers`} />
            <MetricCard icon={ListChecks} label="Follow-Ups Created" value={numberValue(data.metrics.followUpRequiredCalls)} helper={`${data.metrics.openFollowUpTasks} open tasks`} tone="warning" />
            <MetricCard icon={FileWarning} label="Open Tasks" value={numberValue(data.metrics.openFollowUpTasks)} helper={`${data.taskMetrics.dueTodayTasks} due today`} />
            <MetricCard icon={AlertTriangle} label="Overdue Tasks" value={numberValue(data.metrics.overdueFollowUpTasks)} helper="Needs manager review" tone={data.metrics.overdueFollowUpTasks > 0 ? 'destructive' : 'default'} />
            <MetricCard icon={ShieldAlert} label="Escalations" value={numberValue(data.metrics.escalatedCalls)} helper={`${percent(data.metrics.escalationRate)} escalation rate`} tone="warning" />
            <MetricCard icon={Clock3} label="Avg Duration" value={durationValue(data.metrics.averageCallDurationSeconds)} helper="Completed call average" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Manager attention</CardTitle>
              <CardDescription>What the pharmacy owner should look at first today.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.managerAttention.length > 0 ? (
                data.managerAttention.map((item) => <AttentionCard key={item.id} item={item} />)
              ) : (
                <p className="text-sm text-muted-foreground">No manager attention items for this period.</p>
              )}
            </CardContent>
          </Card>

          {!hasData ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No analytics found for this range. Import patients or place calls to populate owner analytics.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Call trend
                    </CardTitle>
                    <CardDescription>Calls, completions, failures, and follow-ups by day.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="calls" stroke="#2563eb" fill="#2563eb" fillOpacity={0.22} name="Calls" />
                        <Area type="monotone" dataKey="completed" stroke="#16a34a" fill="#16a34a" fillOpacity={0.22} name="Completed" />
                        <Area type="monotone" dataKey="failed" stroke="#dc2626" fill="#dc2626" fillOpacity={0.16} name="Failed/no answer" />
                        <Area type="monotone" dataKey="followUps" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.18} name="Follow-ups" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Workflow performance
                    </CardTitle>
                    <CardDescription>Completion rate by workflow.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.workflowBreakdown.slice(0, 6)} layout="vertical" margin={{ left: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} />
                        <YAxis type="category" dataKey="workflow" width={112} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="successRate" fill="#16a34a" name="Success %" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <BreakdownCard title="Task status" description="Follow-up queue state." rows={data.taskMetrics.tasksByStatus} />
                <BreakdownCard title="Task priority" description="Urgency across staff work." rows={data.taskMetrics.tasksByPriority} />
                <BreakdownCard title="Assigned team workload" description="Open and recent tasks by team." rows={data.taskMetrics.tasksByAssignedTeam} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Workflow performance</CardTitle>
                  <CardDescription>Outbound call results and follow-up workload by workflow.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <WorkflowTable rows={data.workflowBreakdown} />
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <TaskTable title="Oldest open tasks" rows={data.taskMetrics.oldestOpenTasks} />
                <TaskTable title="Urgent tasks" rows={data.taskMetrics.urgentTasks} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
