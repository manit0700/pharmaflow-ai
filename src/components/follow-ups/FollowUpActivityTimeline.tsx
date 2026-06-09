import { formatActivityTime } from './FollowUpHelpers'
import type { FollowUpActivity } from '@/types/followUps'
import { cn } from '@/lib/utils'

const TYPE_LABELS: Record<FollowUpActivity['type'], string> = {
  created: 'Task created',
  assigned: 'Assigned',
  note: 'Note added',
  status_changed: 'Status changed',
  rescheduled: 'Rescheduled',
  completed: 'Completed',
  call_outcome: 'Call outcome',
}

interface FollowUpActivityTimelineProps {
  activity: FollowUpActivity[]
}

export function FollowUpActivityTimeline({ activity }: FollowUpActivityTimelineProps) {
  if (activity.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/80 bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
        No activity yet. Actions on this task will appear here.
      </p>
    )
  }

  const sorted = [...activity].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )

  return (
    <div className="space-y-3 sm:space-y-4" role="list" aria-label="Activity timeline">
      {sorted.map((item, idx) => (
        <div key={item.id} className="relative flex gap-2 sm:gap-3 pl-1" role="listitem">
          {idx < sorted.length - 1 && (
            <span className="absolute left-[7px] top-5 h-full w-px bg-border" aria-hidden />
          )}
          <span
            className={cn(
              'relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary bg-card',
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1 pb-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {TYPE_LABELS[item.type]}
              {item.actor ? ` · ${item.actor}` : ''}
            </p>
            <p className="break-words text-sm leading-relaxed">{item.message}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatActivityTime(item.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
