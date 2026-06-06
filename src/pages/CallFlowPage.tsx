import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CallStatusBanners } from '@/components/calls/CallStatusBanners'
import { CALL_REASONS } from '@/constants/callReasons'
import { fetchHealth, type HealthResponse } from '@/utils/api'

export function CallFlowPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false))
  }, [])

  const mode = health?.callMode ?? 'dtmf'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outbound call flow</h1>
        <p className="text-sm text-muted-foreground">
          Live Twilio outbound path — greeting, identity check, patient answer, staff escalation
        </p>
      </div>

      <CallStatusBanners health={health} loading={loading} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Call mode</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={mode === 'ai' ? 'default' : 'secondary'} className="text-sm">
              {mode === 'ai' ? 'AI speech' : 'Keypad (DTMF)'}
            </Badge>
            <p className="mt-2 text-xs text-muted-foreground">
              Set <code>CALL_MODE</code> in <code>server/local.config.json</code>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scripts</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="text-muted-foreground">Preview spoken prompts on your PC:</p>
            <code className="block text-xs">npm run preview:scripts</code>
            {mode === 'ai' && <code className="block text-xs">npm run preview:ai-prompt</code>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/dashboard" className="text-sm text-primary underline">
              Open call jobs dashboard →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call steps (every outbound call)</CardTitle>
          <CardDescription>Same flow for all call reasons; menu text changes per reason</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              <strong>Greeting</strong> — Pharmacy name + patient name (TTS)
            </li>
            <li>
              <strong>DOB verification</strong> — Patient enters 4-digit month/day on keypad, or confirms in AI mode
            </li>
            <li>
              <strong>Main message</strong> — Reason-specific script (refill, pickup, delivery, insurance, callback)
            </li>
            <li>
              <strong>Patient answer</strong> — Keypad 1/2/3/0 or AI speech → stored as <code>patientResponse</code>
            </li>
            <li>
              <strong>Close or transfer</strong> — Thank you, callback flag, or dial staff phone
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call reasons</CardTitle>
          <CardDescription>Each maps to a script in server/src/services/callScripts.ts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {CALL_REASONS.map((r) => (
              <div key={r.value} className="rounded-md border border-border/60 p-3">
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{r.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
