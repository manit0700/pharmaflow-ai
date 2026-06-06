import { Download, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FollowUpHeaderProps {
  onCreateTask: () => void
  onExport: () => void
  onRefresh: () => void
  refreshing?: boolean
}

export function FollowUpHeader({ onCreateTask, onExport, onRefresh, refreshing }: FollowUpHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Follow-Up Queue</h1>
        <p className="text-sm text-muted-foreground">
          Manage patient callbacks, failed calls, pharmacist reviews, insurance issues, and urgent pharmacy
          tasks.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCreateTask} aria-label="Create follow-up task">
          <Plus className="h-4 w-4" />
          Create Task
        </Button>
        <Button variant="outline" onClick={onExport} aria-label="Export follow-up queue">
          <Download className="h-4 w-4" />
          Export Queue
        </Button>
        <Button variant="outline" onClick={onRefresh} disabled={refreshing} aria-label="Refresh queue">
          <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </Button>
      </div>
    </header>
  )
}
