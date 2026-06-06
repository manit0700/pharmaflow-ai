import { Download, RefreshCw, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { exportExcelUrl, type HealthResponse } from '@/utils/api'

export function CallOpsToolbar({
  health,
  loading,
  onRefresh,
  onUpload,
}: {
  health: HealthResponse | null
  loading: boolean
  onRefresh: () => void
  onUpload: (file: File) => void
}) {
  return (
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
      {health?.ok && health.twilioAccount?.type && (
        <Badge variant={health.twilioAccount.type === 'Trial' ? 'warning' : 'success'}>
          Twilio {health.twilioAccount.type}
          {health.twilioAccount.friendlyName ? ` · ${health.twilioAccount.friendlyName}` : ''}
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
      {health?.twilioConfigured && <Badge variant="default">Twilio connected</Badge>}
      {health?.ok && !health.testMode && health.liveCallReadiness?.ready && (
        <Badge variant="success">Live Twilio ready</Badge>
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
          if (f) void onUpload(f)
          e.target.value = ''
        }}
      />
      <Button variant="outline" size="sm" asChild>
        <a href={exportExcelUrl()} download>
          <Download className="h-3.5 w-3.5" />
          Export
        </a>
      </Button>
    </div>
  )
}
