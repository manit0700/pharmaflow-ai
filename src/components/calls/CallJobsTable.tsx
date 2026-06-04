import { Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CallJob, HealthResponse } from '@/utils/api'

function formatCallStatus(status: string) {
  if (status === 'completed') return 'Completed'
  return status.replace(/_/g, ' ')
}

export function CallJobsTable({
  jobs,
  callingId,
  onStart,
  onRetry,
  health,
  emptyMessage = 'Upload an Excel file to create call jobs.',
}: {
  jobs: CallJob[]
  callingId: string | null
  onStart: (id: string) => void
  onRetry: (id: string) => void
  health?: HealthResponse | null
  emptyMessage?: string
}) {
  const liveModeBlocked = Boolean(health?.ok && !health.testMode && !health.liveCallReadiness?.ready)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-3">Patient</th>
            <th className="pb-2 pr-3">Phone</th>
            <th className="pb-2 pr-3">Reason</th>
            <th className="pb-2 pr-3">Validation</th>
            <th className="pb-2 pr-3">Call status</th>
            <th className="pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-border/60">
              <td className="py-2.5 pr-3 font-medium">{j.patientName}</td>
              <td className="py-2.5 pr-3 font-mono text-xs">{j.phoneNumber}</td>
              <td className="py-2.5 pr-3 capitalize">{j.callReason.replace(/_/g, ' ')}</td>
              <td className="py-2.5 pr-3">
                <Badge variant={j.validationStatus === 'valid' ? 'success' : 'destructive'}>
                  {j.validationStatus}
                </Badge>
              </td>
              <td className="py-2.5 pr-3">
                <div>{formatCallStatus(j.callStatus)}</div>
                {j.errorMessage && (
                  <div className="max-w-72 truncate text-xs text-destructive" title={j.errorMessage}>
                    {j.errorMessage}
                  </div>
                )}
              </td>
              <td className="py-2.5">
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={
                      j.validationStatus !== 'valid' ||
                      callingId === j.id ||
                      liveModeBlocked ||
                      j.callStatus === 'completed' ||
                      j.callStatus === 'dialing'
                    }
                    onClick={() => onStart(j.id)}
                    title={
                      liveModeBlocked
                        ? health?.liveCallReadiness?.issues.join(' ')
                        : j.callStatus === 'completed'
                          ? 'Use Retry to call again'
                          : 'Start outbound call'
                    }
                  >
                    <Phone className="h-3 w-3" />
                    Call
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={callingId === j.id || liveModeBlocked}
                    onClick={() => onRetry(j.id)}
                    title={liveModeBlocked ? health?.liveCallReadiness?.issues.join(' ') : 'Retry call'}
                  >
                    Retry
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {liveModeBlocked && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {health?.liveCallReadiness?.issues.join(' ')}
        </div>
      )}
      {jobs.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  )
}
