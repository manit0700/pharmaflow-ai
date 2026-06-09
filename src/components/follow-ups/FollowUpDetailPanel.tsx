import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { FollowUpActions } from './FollowUpActions'
import { FollowUpActivityTimeline } from './FollowUpActivityTimeline'
import {
  displayStatus,
  formatDueDisplay,
  formatTime12,
  isTaskOverdue,
  isTaskTerminal,
  priorityBadgeVariant,
  statusBadgeVariant,
} from './FollowUpHelpers'
import { formatTime } from '@/lib/utils'
import type { FollowUpPriority, FollowUpTask } from '@/types/followUps'
import { cn } from '@/lib/utils'

interface FollowUpDetailPanelProps {
  task: FollowUpTask | null
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

export function FollowUpDetailPanel({
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
}: FollowUpDetailPanelProps) {
  if (!task) {
    return (
      <Card className="border-border/70">
        <CardContent className="flex items-center justify-center p-8 text-sm text-muted-foreground">
          Select a task to view details and take action.
        </CardContent>
      </Card>
    )
  }

  const overdue = isTaskOverdue(task)
  const statusLabel = displayStatus(task)
  const terminal = isTaskTerminal(task)

  return (
    <Card
      className={cn(
        'border-border/70 xl:sticky xl:top-4',
        task.status === 'Completed' && 'border-success/30 bg-success/5',
        task.status === 'Cancelled' && 'border-muted bg-muted/20 opacity-90',
        task.priority === 'Urgent' && !terminal && 'border-destructive/30',
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{task.patientMasked}</CardTitle>
        <p className="text-sm text-muted-foreground">{task.phoneMasked}</p>
        <div className="flex flex-wrap gap-1 pt-1">
          <Badge variant={priorityBadgeVariant(task.priority)}>{task.priority}</Badge>
          <Badge variant={statusBadgeVariant(task.status, overdue)}>{statusLabel}</Badge>
          <Badge variant="outline">{task.taskType}</Badge>
          {task.createdFromCall && <Badge variant="secondary">Created from call</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Source workflow</dt>
            <dd className="text-right font-medium">{task.sourceWorkflow}</dd>
          </div>
          {task.relatedCallId && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Linked call</dt>
              <dd className="font-mono text-xs">{task.relatedCallId.slice(0, 12)}…</dd>
            </div>
          )}
          {task.relatedCallAt && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Related call</dt>
              <dd className="text-right">{formatTime(task.relatedCallAt)}</dd>
            </div>
          )}
          {task.relatedCallStatus && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Call status</dt>
              <dd className="text-right capitalize">{task.relatedCallStatus.replace(/_/g, ' ')}</dd>
            </div>
          )}
          {task.relatedCallOutcome && (
            <div>
              <dt className="text-muted-foreground">Call result</dt>
              <dd className="mt-0.5 break-words">{task.relatedCallOutcome}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Due</dt>
            <dd className="text-right font-medium">
              {formatDueDisplay(task)} ({formatTime12(task.dueTime)})
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Assigned</dt>
            <dd>
              <Badge variant={task.assignedTeam === 'Unassigned' ? 'secondary' : 'outline'}>
                {task.assignedTeam}
              </Badge>
            </dd>
          </div>
        </dl>

        <Separator />

        <div>
          <h3 className="mb-1 text-sm font-semibold">Issue summary</h3>
          <p className="text-sm break-words">{task.issueSummary}</p>
        </div>

        {task.staffNotes && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">Staff notes</h3>
            <p className="whitespace-pre-wrap text-sm break-words text-muted-foreground">{task.staffNotes}</p>
          </div>
        )}

        <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
          <h3 className="mb-1 text-sm font-semibold">AI recommended next action</h3>
          <p className="text-sm break-words">{task.aiRecommendedAction}</p>
        </div>

        <FollowUpActions
          task={task}
          saving={saving}
          onStartTask={onStartTask}
          onAssign={onAssign}
          onAddNote={onAddNote}
          onReschedule={onReschedule}
          onMarkComplete={onMarkComplete}
          onCancelTask={onCancelTask}
          onReopen={onReopen}
          onViewCall={onViewCall}
          onPriorityChange={onPriorityChange}
        />

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold">Activity timeline</h3>
          <FollowUpActivityTimeline activity={task.activity} />
        </div>

        <p className="text-xs text-muted-foreground">
          Compliance note: All follow-up actions in production are audit-logged and restricted to authorized
          pharmacy staff with valid patient consent on file.
        </p>
      </CardContent>
    </Card>
  )
}
