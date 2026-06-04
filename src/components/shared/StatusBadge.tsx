import { Badge } from '@/components/ui/badge'
import type { ResolutionStatus, WorkflowStatus } from '@/types'

const resolutionMap: Record<ResolutionStatus, 'success' | 'warning' | 'destructive'> = {
  resolved: 'success',
  pending: 'warning',
  escalated: 'destructive',
}

const workflowMap: Record<WorkflowStatus, 'default' | 'secondary' | 'success' | 'warning'> = {
  draft: 'secondary',
  active: 'success',
  needs_review: 'warning',
}

export function ResolutionBadge({ status }: { status: ResolutionStatus }) {
  return (
    <Badge variant={resolutionMap[status]} className="capitalize">
      {status}
    </Badge>
  )
}

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const labels = { draft: 'Draft', active: 'Active', needs_review: 'Needs Review' }
  return <Badge variant={workflowMap[status]}>{labels[status]}</Badge>
}
