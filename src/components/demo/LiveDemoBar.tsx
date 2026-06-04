import { Radio, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLiveDemo } from '@/context/LiveDemoContext'
import { cn } from '@/lib/utils'

export function LiveDemoBar() {
  const { isLive, startDemo, stopDemo, callsThisSession, activeDials } = useLiveDemo()

  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 text-sm',
        isLive ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/40',
      )}
    >
      <div className="flex items-center gap-2">
        {isLive ? (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
        ) : (
          <Radio className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium">
          {isLive ? 'Live demo running' : 'Presentation mode'}
        </span>
        {isLive && (
          <>
            <Badge variant="default">{callsThisSession} calls this session</Badge>
            {activeDials > 0 && (
              <Badge variant="secondary">{activeDials} active dial{activeDials > 1 ? 's' : ''}</Badge>
            )}
          </>
        )}
      </div>
      <p className="hidden text-xs text-muted-foreground md:block">
        {isLive
          ? 'Simulated outbound batch — KPIs and workflow canvas update automatically'
          : 'Start a live walkthrough for stakeholders (no backend required)'}
      </p>
      <div className="ml-auto flex gap-2">
        {isLive ? (
          <Button size="sm" variant="outline" onClick={stopDemo}>
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop demo
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => startDemo()}>
              <Radio className="h-3.5 w-3.5" />
              Start live demo
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const url = new URL(window.location.href)
                url.pathname = '/workflows'
                url.searchParams.set('demo', 'live')
                window.history.replaceState({}, '', url)
                startDemo()
              }}
            >
              Auto-play (URL)
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
