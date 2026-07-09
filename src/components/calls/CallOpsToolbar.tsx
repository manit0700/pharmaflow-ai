import { useState } from 'react'
import { Clock, Download, RefreshCw, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ImportPreviewDialog } from '@/components/calls/ImportPreviewDialog'
import { exportExcelUrl, type HealthResponse } from '@/utils/api'

export function CallOpsToolbar({
  health,
  loading,
  onRefresh,
  onUpload,
  onSchedule,
}: {
  health: HealthResponse | null
  loading: boolean
  onRefresh: () => void
  onUpload: (file: File) => void
  onSchedule?: (scheduledFor: string) => void
}) {
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const provider = health?.phoneProvider
  const providerAccount = provider?.account ?? health?.twilioAccount

  const handleConfirmSchedule = () => {
    if (scheduleDate && onSchedule) {
      onSchedule(new Date(scheduleDate).toISOString())
    }
    setSchedulePanelOpen(false)
    setScheduleDate('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={health?.ok ? 'success' : 'destructive'}>
          API {health?.ok ? 'online' : 'offline'}
        </Badge>
        {health?.ok && health.apiVersion !== 2 && (
          <Badge variant="destructive">Restart API (add patient needs update)</Badge>
        )}
        {health?.ok && health.testMode && (
          <Badge variant="secondary">Simulated calls</Badge>
        )}
        {health?.ok && providerAccount?.type && (
          <Badge variant={providerAccount.type === 'Trial' ? 'warning' : 'success'}>
            {provider?.displayName ?? 'PharmaFlow Calling'} {providerAccount.type}
            {providerAccount.friendlyName ? ` · ${providerAccount.friendlyName}` : ''}
          </Badge>
        )}
        {health?.callMode && (
          <Badge variant={health.callMode === 'ai' ? 'default' : 'secondary'}>
            {health.callMode === 'ai' ? 'AI calls' : 'Keypad (DTMF)'}
          </Badge>
        )}
        {health?.callMode === 'ai' && health.aiCallConfigured === false && (
          <Badge variant="destructive">OpenAI key missing</Badge>
        )}
        {(provider?.configured ?? health?.twilioConfigured) && (
          <Badge variant="default">{provider?.carrierName ?? 'Twilio'} carrier connected</Badge>
        )}
        {health?.ok && !health.testMode && health.liveCallReadiness?.ready && (
          <Badge variant="success">Live calling ready</Badge>
        )}
        {health?.ok && !health.testMode && !health.liveCallReadiness?.ready && (
          <Badge variant="destructive">Live mode needs setup</Badge>
        )}
        <Button variant="outline" size="sm" disabled={loading} onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => document.getElementById('dashboard-excel-upload')?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Import Excel
        </Button>
        <input
          id="dashboard-excel-upload"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setPendingImport(f)
            e.target.value = ''
          }}
        />
        <ImportPreviewDialog
          file={pendingImport}
          onCancel={() => setPendingImport(null)}
          onConfirm={(f) => {
            void onUpload(f)
            setPendingImport(null)
          }}
        />
        <Button variant="outline" size="sm" asChild>
          <a href={exportExcelUrl()} download>
            <Download className="h-3.5 w-3.5" />
            Export
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSchedulePanelOpen((o) => !o)}
        >
          <Clock className="h-3.5 w-3.5" />
          Schedule calls
        </Button>
      </div>

      {schedulePanelOpen && (
        <div className="rounded-md border border-border bg-muted/40 p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="schedule-datetime" className="text-xs font-medium text-muted-foreground">
              Schedule for
            </label>
            <input
              id="schedule-datetime"
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground self-end pb-1">
            All queued calls will be placed at this time
          </p>
          <div className="flex items-center gap-3 self-end">
            <Button
              size="sm"
              disabled={!scheduleDate}
              onClick={handleConfirmSchedule}
            >
              Confirm schedule
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => {
                setSchedulePanelOpen(false)
                setScheduleDate('')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
