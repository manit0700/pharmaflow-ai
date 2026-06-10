import { Radio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CallJob, HealthResponse } from '@/utils/api'
import { buildLiveFeed, latestPatientReply } from '@/utils/liveTranscript'
import { cn } from '@/lib/utils'

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

export function ActiveCallsPanel({
  jobs,
  health,
  callingId,
}: {
  jobs: CallJob[]
  health: HealthResponse | null
  callingId: string | null
}) {
  if (jobs.length === 0) return null

  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Radio className="h-4 w-4 text-primary animate-pulse" />
          <CardTitle className="text-base">Live calls ({jobs.length})</CardTitle>
          <Badge variant="default">Updating every 2s</Badge>
          {health?.callMode && (
            <Badge variant="secondary">{health.callMode === 'ai' ? 'AI speech' : 'Keypad'}</Badge>
          )}
        </div>
        <CardDescription>Patient replies and keypad input appear here as the call progresses</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {jobs.map((job) => {
          const feed = buildLiveFeed(job)
          const latest = latestPatientReply(job)
          const isStarting = callingId === job.id

          return (
            <div
              key={job.id}
              className={cn(
                'rounded-lg border p-4 space-y-3',
                isStarting ? 'border-primary bg-primary/5' : 'border-border/80',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{job.patientName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{job.phoneNumber}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">
                    {job.callReason.replace(/_/g, ' ')} · {job.medicationName}
                  </p>
                </div>
                <Badge variant={job.callStatus === 'in_progress' ? 'success' : 'warning'} className="capitalize">
                  {isStarting ? 'connecting…' : statusLabel(job.callStatus)}
                </Badge>
              </div>

              {latest && (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                    Latest from patient
                  </p>
                  <p className="text-sm font-medium">{latest}</p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">Call activity</p>
                <ScrollArea className="h-40 rounded-md border border-border/60 bg-muted/20 p-2">
                  {feed.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">
                      {isStarting || job.callStatus === 'dialing' || job.callStatus === 'queued_live'
                        ? 'Ringing… waiting for patient to answer.'
                        : 'Waiting for patient input…'}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {feed.map((item) => (
                        <li
                          key={item.id}
                          className={cn(
                            'rounded px-2 py-1.5 text-xs',
                            item.speaker === 'patient' && 'bg-background border border-border/60',
                            item.speaker === 'pharmacy' && 'bg-primary/10 ml-2',
                            item.speaker === 'system' && 'text-muted-foreground italic',
                          )}
                        >
                          <span className="font-semibold capitalize">{item.speaker}: </span>
                          {item.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
