import type { ExecutionLogEntry } from '@/hooks/useWorkflowSimulation'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

export function ExecutionLogPanel({ logs }: { logs: ExecutionLogEntry[] }) {
  return (
    <div className="h-36 shrink-0 border-t border-border bg-card">
      <div className="flex h-9 items-center border-b border-border px-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Execution logs
        </p>
      </div>
      <div className="h-[calc(100%-2.25rem)] overflow-auto px-4 py-2 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-muted-foreground">Run a test workflow to see step-by-step logs.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 py-0.5">
              <span className="shrink-0 text-muted-foreground">{formatTime(log.timestamp)}</span>
              <span
                className={cn(
                  log.level === 'success' && 'text-success',
                  log.level === 'warning' && 'text-warning',
                  log.level === 'error' && 'text-destructive',
                )}
              >
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
