import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fetchAuditEvents, type AuditResponse } from '@/utils/api'
import { formatTime } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const severityVariant = {
  info: 'secondary' as const,
  warning: 'warning' as const,
  critical: 'destructive' as const,
}

export function CompliancePage() {
  const [audit, setAudit] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAuditEvents()
      .then(setAudit)
      .catch(() => setAudit(null))
      .finally(() => setLoading(false))
    const id = setInterval(() => {
      fetchAuditEvents().then(setAudit).catch(() => {})
    }, 12000)
    return () => clearInterval(id)
  }, [])

  const stats = audit?.stats

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Live trail of outbound calls, Twilio events, and staff escalations from your database
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          : [
              { title: 'Twilio events', value: String(stats?.callEvents ?? 0) },
              { title: 'Staff tasks', value: String(stats?.staffTasks ?? 0) },
              { title: 'Outbound calls', value: String(stats?.outboundCalls ?? 0) },
              { title: 'Follow-ups needed', value: String(stats?.followUpsNeeded ?? 0) },
            ].map((c) => (
              <Card key={c.title}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground">{c.title}</p>
                  <p className="text-2xl font-semibold mt-1">{c.value}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Newest events first — refreshes every 12 seconds</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[32rem] overflow-auto">
          {!audit?.events.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No audit events yet. Place outbound calls to populate this log.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {audit.events.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{e.action}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.details}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{e.resource}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={severityVariant[e.severity]}>{e.severity}</Badge>
                    <span className="text-[10px] text-muted-foreground">{formatTime(e.timestamp)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
