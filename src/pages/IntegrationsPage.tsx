import { RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CallStatusBanners } from '@/components/calls/CallStatusBanners'
import { useLiveIntegrations } from '@/hooks/useLiveIntegrations'
import { formatTime } from '@/lib/utils'
import { ArrowRight, Phone, Bot, Database, Bell } from 'lucide-react'

export function IntegrationsPage() {
  const { integrations, health, loading, refresh } = useLiveIntegrations()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Live connection status from your PC API — PharmaFlow Calling, OpenAI, database, webhooks
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <CallStatusBanners health={health} loading={loading} />

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Outbound call path</CardTitle>
          <CardDescription>How a call moves through your stack</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-center gap-2 py-4 text-sm font-medium">
            <span className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Phone className="h-4 w-4 text-primary" /> PharmaFlow dial
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Bot className="h-4 w-4 text-primary" /> {health?.callMode === 'ai' ? 'AI + speech' : 'DTMF scripts'}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="rounded-md border border-border bg-card px-3 py-2">PharmaFlow API</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Database className="h-4 w-4" /> SQLite
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Bell className="h-4 w-4" /> Staff tasks
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {integrations.map((i) => (
          <Card key={i.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{i.name}</CardTitle>
                  <CardDescription>{i.category}</CardDescription>
                </div>
                <Badge
                  variant={
                    i.health === 'healthy' ? 'success' : i.health === 'degraded' ? 'warning' : 'destructive'
                  }
                >
                  {i.connected ? i.health : 'offline'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{i.summary}</p>
              <p className="text-xs text-muted-foreground">
                Checked: {i.lastSync === '—' ? '—' : formatTime(i.lastSync)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
