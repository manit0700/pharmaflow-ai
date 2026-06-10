import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { WorkflowNodeData } from '@/types'

const categoryColors: Record<string, string> = {
  trigger: 'border-l-[#0891b2]',
  ai: 'border-l-[#0d9488]',
  logic: 'border-l-[#64748b]',
  action: 'border-l-[#0e7490]',
  compliance: 'border-l-[#475569]',
}

const stateRing: Record<string, string> = {
  idle: '',
  running: 'ring-2 ring-primary animate-pulse',
  success: 'ring-2 ring-success',
  failed: 'ring-2 ring-destructive',
  escalated: 'ring-2 ring-warning',
}

export function PharmaNode({ data, selected }: NodeProps) {
  const d = data as unknown as WorkflowNodeData
  const state = d.executionState ?? 'idle'

  return (
    <div
      className={cn(
        'min-w-[140px] rounded-md border border-border bg-card px-3 py-2 shadow-sm border-l-4',
        categoryColors[d.category],
        stateRing[state],
        selected && 'border-primary',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2 !h-2" />
      <p className="text-xs font-semibold">{d.label}</p>
      <p className="text-[10px] text-muted-foreground capitalize">{d.category}</p>
      {state !== 'idle' && (
        <p className="mt-1 text-[10px] font-medium capitalize text-muted-foreground">{state}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2 !h-2" />
    </div>
  )
}
