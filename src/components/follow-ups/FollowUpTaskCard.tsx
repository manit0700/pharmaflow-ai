import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  displayStatus,
  formatActivityTime,
  formatDueDisplay,
  priorityBadgeVariant,
  statusBadgeVariant,
  isTaskOverdue,
} from './FollowUpHelpers'
import type { FollowUpTask } from '@/types/followUps'
import { cn } from '@/lib/utils'

interface FollowUpTaskCardProps {
  task: FollowUpTask
  selected: boolean
  onSelect: () => void
  onAssign: () => void
  onAddNote: () => void
  onReschedule: () => void
  onMarkComplete: () => void
}

export function FollowUpTaskCard({
  task,
  selected,
  onSelect,
  onAssign,
  onAddNote,
  onReschedule,
  onMarkComplete,
}: FollowUpTaskCardProps) {
  const overdue = isTaskOverdue(task)
  const statusLabel = displayStatus(task)

  return (
    <Card
      className={cn(
        'cursor-pointer border-border/70 transition-colors hover:border-primary/40',
        selected && 'border-primary ring-1 ring-primary/30',
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      aria-pressed={selected}
      aria-label={`Follow-up task for ${task.patientMasked}`}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{task.patientMasked}</p>
            <p className="text-xs text-muted-foreground">{task.phoneMasked}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant={priorityBadgeVariant(task.priority)}>{task.priority}</Badge>
            <Badge variant={statusBadgeVariant(task.status, overdue)}>{statusLabel}</Badge>
          </div>
        </div>

        <div className="grid gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Type:</span> {task.taskType}
          </p>
          <p>
            <span className="text-muted-foreground">Source:</span> {task.sourceWorkflow}
          </p>
          <p>
            <span className="text-muted-foreground">Due:</span> {formatDueDisplay(task)}
          </p>
          <p>
            <span className="text-muted-foreground">Assigned:</span>{' '}
            <Badge variant={task.assignedTeam === 'Unassigned' ? 'secondary' : 'outline'} className="ml-1">
              {task.assignedTeam}
            </Badge>
          </p>
        </div>

        {task.relatedCallOutcome && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Call outcome:</span> {task.relatedCallOutcome}
          </p>
        )}

        <p className="line-clamp-2 text-sm">{task.issueSummary}</p>
        <p className="text-xs text-muted-foreground">Last activity: {formatActivityTime(task.lastActivityAt)}</p>

        <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={onSelect} aria-label="View details">
            View Details
          </Button>
          <Button size="sm" variant="outline" onClick={onAssign} aria-label="Assign staff">
            Assign
          </Button>
          <Button size="sm" variant="outline" onClick={onAddNote} aria-label="Add note">
            Add Note
          </Button>
          <Button size="sm" variant="outline" onClick={onReschedule} aria-label="Reschedule">
            Reschedule
          </Button>
          {task.status !== 'Completed' && (
            <Button size="sm" variant="outline" onClick={onMarkComplete} aria-label="Mark complete">
              Mark Complete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
