import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Flag,
  Phone,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { formatActivityTime } from './FollowUpHelpers'
import type { FollowUpActivity } from '@/types/followUps'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TYPE_LABELS: Record<FollowUpActivity['type'], string> = {
  created: 'Task created',
  assigned: 'Assigned',
  note: 'Note added',
  status_changed: 'Status changed',
  rescheduled: 'Rescheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  call_outcome: 'Call outcome',
  priority_changed: 'Priority changed',
  due_date_changed: 'Due date changed',
}

const TYPE_BADGE: Record<FollowUpActivity['type'], 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning'> = {
  created: 'secondary',
  assigned: 'default',
  note: 'outline',
  status_changed: 'warning',
  rescheduled: 'outline',
  completed: 'success',
  cancelled: 'destructive',
  call_outcome: 'secondary',
  priority_changed: 'warning',
  due_date_changed: 'outline',
}

function ActivityIcon({ type }: { type: FollowUpActivity['type'] }) {
  const className = 'h-4 w-4 shrink-0 text-primary'
  switch (type) {
    case 'assigned':
      return <UserCheck className={className} aria-hidden />
    case 'note':
      return <FileText className={className} aria-hidden />
    case 'completed':
      return <CheckCircle2 className={className} aria-hidden />
    case 'cancelled':
      return <XCircle className={className} aria-hidden />
    case 'call_outcome':
      return <Phone className={className} aria-hidden />
    case 'priority_changed':
      return <Flag className={className} aria-hidden />
    case 'due_date_changed':
    case 'rescheduled':
      return <CalendarClock className={className} aria-hidden />
    case 'status_changed':
      return <AlertCircle className={className} aria-hidden />
    default:
      return <CheckCircle2 className={className} aria-hidden />
  }
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
            <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden />
          )}
          <span
            className={cn(
              'relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-card',
            )}
            aria-hidden
          >
            <ActivityIcon type={item.type} />
          </span>
          <div className="min-w-0 flex-1 pb-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant={TYPE_BADGE[item.type]} className="text-[10px]">
                {TYPE_LABELS[item.type]}
              </Badge>
              {item.actor && <span className="text-xs text-muted-foreground">{item.actor}</span>}
            </div>
            <p className="break-words text-sm leading-relaxed">{item.message}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatActivityTime(item.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
