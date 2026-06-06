import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface AnalyticsData {
  byType: Record<string, number>
  byPriority: Record<string, number>
  open: number
  completed: number
  avgAgeDays: number
  overdue: number
}

interface FollowUpAnalyticsMiniProps {
  analytics: AnalyticsData
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="truncate pr-2">{label}</span>
        <span className="shrink-0 font-medium">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full bg-primary/70 transition-all')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function FollowUpAnalyticsMini({ analytics }: FollowUpAnalyticsMiniProps) {
  const typeEntries = Object.entries(analytics.byType).sort((a, b) => b[1] - a[1])
  const priorityEntries = Object.entries(analytics.byPriority).sort((a, b) => b[1] - a[1])
  const maxType = Math.max(1, ...typeEntries.map(([, v]) => v))
  const maxPriority = Math.max(1, ...priorityEntries.map(([, v]) => v))
  const total = analytics.open + analytics.completed
  const openPct = total > 0 ? Math.round((analytics.open / total) * 100) : 0

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tasks by type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {typeEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open tasks</p>
          ) : (
            typeEntries.slice(0, 5).map(([label, value]) => (
              <BarRow key={label} label={label} value={value} max={maxType} />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tasks by priority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {priorityEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open tasks</p>
          ) : (
            priorityEntries.map(([label, value]) => (
              <BarRow key={label} label={label} value={value} max={maxPriority} />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Open vs completed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <BarRow label="Open" value={analytics.open} max={total || 1} />
          <BarRow label="Completed" value={analytics.completed} max={total || 1} />
          <p className="text-xs text-muted-foreground">{openPct}% of all tasks are open</p>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Queue health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Overdue</span>
            <span className={analytics.overdue > 0 ? 'font-semibold text-destructive' : 'font-medium'}>
              {analytics.overdue}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg age (open)</span>
            <span className="font-medium">{analytics.avgAgeDays} days</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
