import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { WorkflowNode } from '@/types'

interface NodeConfigDrawerProps {
  node: WorkflowNode | null
  onClose: () => void
  onUpdate: (nodeId: string, config: Record<string, string | number | boolean>) => void
}

export function NodeConfigDrawer({ node, onClose, onUpdate }: NodeConfigDrawerProps) {
  if (!node) return null

  const config = node.data.config

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{node.data.label}</p>
          <p className="text-xs text-muted-foreground">{node.data.nodeType}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close config">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {Object.entries(config).length === 0 ? (
          <p className="text-sm text-muted-foreground">No configurable fields for this node type.</p>
        ) : (
          Object.entries(config).map(([key, value]) => (
            <div key={key} className="space-y-1.5">
              <Label className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</Label>
              {String(value).length > 60 ? (
                <Textarea
                  defaultValue={String(value)}
                  onChange={(e) =>
                    onUpdate(node.id, { ...config, [key]: e.target.value })
                  }
                />
              ) : (
                <Input
                  defaultValue={String(value)}
                  onChange={(e) =>
                    onUpdate(node.id, { ...config, [key]: e.target.value })
                  }
                />
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
