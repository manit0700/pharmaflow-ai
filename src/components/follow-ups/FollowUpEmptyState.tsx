import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface FollowUpEmptyStateProps {
  onCreateTask?: () => void
}

export function FollowUpEmptyState({ onCreateTask }: FollowUpEmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <ClipboardList className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="max-w-sm text-sm text-muted-foreground">
          No follow-up tasks found. Try changing filters or create a new task.
        </p>
        {onCreateTask && (
          <Button onClick={onCreateTask} size="sm">
            Create Task
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
