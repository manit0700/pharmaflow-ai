import { Mic, PhoneOutgoing } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useLiveDemo } from '@/context/LiveDemoContext'
import { ResolutionBadge } from '@/components/shared/StatusBadge'
import { formatTime } from '@/lib/utils'
import type { ResolutionStatus } from '@/types'

function statusBadge(status: ResolutionStatus | 'dialing') {
  if (status === 'dialing') return <Badge variant="default">Dialing…</Badge>
  return <ResolutionBadge status={status} />
}

export function LiveCallFeed() {
  const { isLive, liveFeed } = useLiveDemo()

  if (!isLive && liveFeed.length === 0) return null

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneOutgoing className="h-4 w-4 text-primary" />
          Live outbound feed
          {isLive && (
            <span className="text-xs font-normal text-primary">● streaming</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-48 space-y-2 overflow-auto">
        {liveFeed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Waiting for first simulated call…</p>
        ) : (
          liveFeed.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/80 px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{e.patientFirstName}</span>
                <span className="text-muted-foreground"> · {e.workflowName}</span>
                <p className="text-xs text-muted-foreground">{e.message}</p>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(e.status)}
                {e.recordingSaved && (
                  <Link to="/conversations" className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                    <Mic className="h-3 w-3" />
                    Recording
                  </Link>
                )}
                <span className="text-[10px] text-muted-foreground">{formatTime(e.timestamp)}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
