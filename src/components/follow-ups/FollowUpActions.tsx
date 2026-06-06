import { Button } from '@/components/ui/button'
import type { FollowUpTask } from '@/types/followUps'

interface FollowUpActionsProps {
  task: FollowUpTask
  onStartTask: () => void
  onAssign: () => void
  onAddNote: () => void
  onReschedule: () => void
  onMarkComplete: () => void
  onReopen: () => void
  onViewCall: () => void
}

export function FollowUpActions({
  task,
  onStartTask,
  onAssign,
  onAddNote,
  onReschedule,
  onMarkComplete,
  onReopen,
  onViewCall,
}: FollowUpActionsProps) {
  const isCompleted = task.status === 'Completed'

  return (
    <div className="flex flex-wrap gap-2">
      {!isCompleted && task.status === 'Open' && (
        <Button size="sm" onClick={onStartTask} aria-label="Start task">
          Start Task
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onAssign} aria-label="Assign staff">
        Assign Staff
      </Button>
      <Button size="sm" variant="outline" onClick={onAddNote} aria-label="Add note">
        Add Note
      </Button>
      {!isCompleted && (
        <Button size="sm" variant="outline" onClick={onReschedule} aria-label="Reschedule callback">
          Reschedule Callback
        </Button>
      )}
      {!isCompleted ? (
        <Button size="sm" variant="outline" onClick={onMarkComplete} aria-label="Mark complete">
          Mark Complete
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={onReopen} aria-label="Reopen task">
          Reopen Task
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onViewCall} aria-label="View related call">
        View Related Call
      </Button>
    </div>
  )
}
