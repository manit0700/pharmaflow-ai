import { nodePalette } from '@/data/mockData'
import type { PaletteNodeDef } from '@/types'
import { ScrollArea } from '@/components/ui/scroll-area'

interface NodePaletteProps {
  onAdd: (def: PaletteNodeDef) => void
}

const groups = [
  { key: 'trigger', title: 'Triggers' },
  { key: 'ai', title: 'AI' },
  { key: 'logic', title: 'Logic' },
  { key: 'action', title: 'Actions' },
  { key: 'compliance', title: 'Compliance' },
] as const

export function NodePalette({ onAdd }: NodePaletteProps) {
  return (
    <div className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="border-b border-border px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Node palette</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-2">
          {groups.map(({ key, title }) => (
            <div key={key}>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase text-muted-foreground">{title}</p>
              <div className="space-y-1">
                {(nodePalette[key] as PaletteNodeDef[]).map((def) => (
                  <button
                    key={def.type}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/pharmaflow-node', JSON.stringify(def))
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => onAdd(def)}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-left text-xs hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="font-medium">{def.label}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground line-clamp-1">
                      {def.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
