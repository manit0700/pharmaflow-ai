import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface FollowUpEmptyStateProps {
  onCreateTask?: () => void
}

export function FollowUpEmptyState({ onCreateTask }: FollowUpEmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <CheckCircle className="h-10 w-10 text-success" aria-hidden />
        <p className="max-w-sm text-sm font-medium">All caught up — no open follow-ups.</p>
        <p className="max-w-sm text-xs text-muted-foreground">New escalations and voicemail tasks will appear here.</p>
        {onCreateTask && (
          <Button onClick={onCreateTask} size="sm">
            Create Task
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
