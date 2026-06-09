import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PRIORITIES } from './FollowUpHelpers'
import type { FollowUpPriority, FollowUpTask } from '@/types/followUps'

interface FollowUpActionsProps {
  task: FollowUpTask
  saving?: boolean
  onStartTask: () => void
  onAssign: () => void
  onAddNote: () => void
  onReschedule: () => void
  onMarkComplete: () => void
  onCancelTask: () => void
  onReopen: () => void
  onViewCall: () => void
  onPriorityChange: (priority: FollowUpPriority) => void
}

export function FollowUpActions({
  task,
  saving = false,
  onStartTask,
  onAssign,
  onAddNote,
  onReschedule,
  onMarkComplete,
  onCancelTask,
  onReopen,
  onViewCall,
  onPriorityChange,
}: FollowUpActionsProps) {
  const isTerminal = task.status === 'Completed' || task.status === 'Cancelled'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Priority</span>
        <Select
          value={task.priority}
          onValueChange={(v) => onPriorityChange(v as FollowUpPriority)}
          disabled={saving || isTerminal}
        >
          <SelectTrigger className="h-8 w-[130px]" aria-label="Change priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {!isTerminal && task.status === 'Open' && (
          <Button size="sm" onClick={onStartTask} disabled={saving} aria-label="Mark in progress">
            Mark In Progress
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onAssign} disabled={saving} aria-label="Assign staff">
          Assign
        </Button>
        <Button size="sm" variant="outline" onClick={onAddNote} disabled={saving} aria-label="Add note">
          Add Note
        </Button>
        {!isTerminal && (
          <Button size="sm" variant="outline" onClick={onReschedule} disabled={saving} aria-label="Reschedule callback">
            Reschedule
          </Button>
        )}
        {!isTerminal && (
          <Button size="sm" variant="outline" onClick={onMarkComplete} disabled={saving} aria-label="Mark complete">
            Mark Complete
          </Button>
        )}
        {!isTerminal && (
          <Button size="sm" variant="destructive" onClick={onCancelTask} disabled={saving} aria-label="Cancel task">
            Cancel Task
          </Button>
        )}
        {isTerminal && (
          <Button size="sm" variant="outline" onClick={onReopen} disabled={saving} aria-label="Reopen task">
            Reopen Task
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onViewCall} disabled={saving} aria-label="View related call">
          View Related Call
        </Button>
      </div>
      {saving && <p className="text-xs text-muted-foreground">Saving changes…</p>}
    </div>
  )
}
