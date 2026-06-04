import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { integrations } from '@/data/mockData'
import { formatTime } from '@/lib/utils'
import { ArrowRight, Phone, Bot, Database, Bell } from 'lucide-react'

export function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connected channels and systems powering pharmacy AI workflows
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">System topology</CardTitle>
          <CardDescription>How patient channels flow through PharmaFlow AI</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-center gap-2 py-4 text-sm font-medium">
            <span className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Phone className="h-4 w-4 text-primary" /> Outbound dialer
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Bot className="h-4 w-4 text-primary" /> AI layer
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="rounded-md border border-border bg-card px-3 py-2">Workflow engine</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Database className="h-4 w-4" /> PMS / staff
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Bell className="h-4 w-4" /> Logging
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
                Last sync: {i.lastSync === '—' ? '—' : formatTime(i.lastSync)}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant={i.connected ? 'outline' : 'default'} disabled={i.connected}>
                  {i.connected ? 'Connected' : 'Connect'}
                </Button>
                <Button size="sm" variant="ghost">
                  Test
                </Button>
                <Button size="sm" variant="ghost">
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
