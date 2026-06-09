import type { FollowUpTask } from '@/types/followUps'
import { FollowUpTaskCard } from './FollowUpTaskCard'
import { FollowUpEmptyState } from './FollowUpEmptyState'
import {
  displayStatus,
  formatActivityTime,
  formatDueDisplay,
  isTaskOverdue,
  priorityBadgeVariant,
  statusBadgeVariant,
} from './FollowUpHelpers'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FollowUpTaskListProps {
  tasks: FollowUpTask[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAssign: (id: string) => void
  onAddNote: (id: string) => void
  onReschedule: (id: string) => void
  onMarkComplete: (id: string) => void
  onCreateTask?: () => void
}

export function FollowUpTaskList({
  tasks,
  selectedId,
  onSelect,
  onAssign,
  onAddNote,
  onReschedule,
  onMarkComplete,
  onCreateTask,
}: FollowUpTaskListProps) {
  if (tasks.length === 0) {
    return <FollowUpEmptyState onCreateTask={onCreateTask} />
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-border md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Patient</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Priority</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Due</th>
              <th className="hidden px-3 py-2 text-left font-medium xl:table-cell">Assigned</th>
              <th className="px-3 py-2 text-left font-medium">Issue</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const overdue = isTaskOverdue(task)
              const statusLabel = displayStatus(task)
              const selected = task.id === selectedId
              return (
                <tr
                  key={task.id}
                  className={cn(
                    'cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/30',
                    selected && 'bg-primary/5',
                  )}
                  onClick={() => onSelect(task.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelect(task.id)
                  }}
                  aria-selected={selected}
                >
                  <td className="px-3 py-3">
                    <p className="font-medium">{task.patientMasked}</p>
                    <p className="text-xs text-muted-foreground">{task.phoneMasked}</p>
                  </td>
                  <td className="px-3 py-3">{task.taskType}</td>
                  <td className="px-3 py-3">
                    <Badge variant={priorityBadgeVariant(task.priority)}>{task.priority}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={statusBadgeVariant(task.status, overdue)}>{statusLabel}</Badge>
                  </td>
                  <td className="hidden px-3 py-3 lg:table-cell">{formatDueDisplay(task)}</td>
                  <td className="hidden px-3 py-3 xl:table-cell">
                    <Badge variant={task.assignedTeam === 'Unassigned' ? 'secondary' : 'outline'}>
                      {task.assignedTeam}
                    </Badge>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-3" title={task.issueSummary}>
                    {task.issueSummary}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => onSelect(task.id)}>
                        View
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onAssign(task.id)}>
                        Assign
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onAddNote(task.id)}>
                        Note
                      </Button>
                      {task.status !== 'Completed' && (
                        <Button size="sm" variant="ghost" onClick={() => onMarkComplete(task.id)}>
                          Done
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {tasks.map((task) => (
          <FollowUpTaskCard
            key={task.id}
            task={task}
            selected={task.id === selectedId}
            onSelect={() => onSelect(task.id)}
            onAssign={() => onAssign(task.id)}
            onAddNote={() => onAddNote(task.id)}
            onReschedule={() => onReschedule(task.id)}
            onMarkComplete={() => onMarkComplete(task.id)}
          />
        ))}
      </div>

      {/* Desktop footer hint */}
      <p className="hidden text-xs text-muted-foreground md:block">
        Showing {tasks.length} task{tasks.length !== 1 ? 's' : ''}. Activity timestamps use your local timezone.
      </p>
    </>
  )
}

export { formatActivityTime }
