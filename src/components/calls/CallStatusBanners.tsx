import { Card, CardContent } from '@/components/ui/card'
import type { HealthResponse } from '@/utils/api'

export function CallStatusBanners({
  health,
  loading,
}: {
  health: HealthResponse | null
  loading: boolean
}) {
  if (loading && !health) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-4 text-sm text-muted-foreground">Connecting to API…</CardContent>
      </Card>
    )
  }

  if (!health?.ok && !loading) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="space-y-2 p-4 text-sm">
          <p>
            <strong>Cannot reach API.</strong> Start both servers on your PC:
          </p>
          <code className="block text-xs">cd ~/Projects/pharmaflow-ai && npm run dev:pc</code>
          <p className="text-muted-foreground">
            Open <strong>http://localhost:5173/dashboard</strong> (use the port Vite prints if
            different). API health: <code className="text-xs">http://localhost:4002/api/health</code>
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!health?.ok) return null

  const configFile =
    health.configSource === 'local.config.json' ? 'server/local.config.json' : 'server/.env'

  return (
    <>
      {health.testMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-sm">
            <strong>Test call mode</strong> — Calls simulate instantly (no Twilio ring). For real
            calls, set <code className="text-xs">AUTO_CALL_TEST_MODE=false</code> in{' '}
            <code className="text-xs">{configFile}</code> and restart the API.
          </CardContent>
        </Card>
      )}

      {health.callMode === 'ai' && health.aiCallConfigured === false && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <strong>AI call mode needs OpenAI</strong> — Set <code>OPENAI_API_KEY</code> in{' '}
            <code>{configFile}</code> or switch to <code>CALL_MODE=dtmf</code> for keypad scripts.
          </CardContent>
        </Card>
      )}

      {!health.testMode && !health.liveCallReadiness?.ready && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <strong>Live Twilio not ready</strong>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {health.liveCallReadiness?.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              On your PC: run <code className="text-xs">npm run ngrok:tunnel</code>, paste the HTTPS
              URL into <code>PUBLIC_BASE_URL</code> in <code>{configFile}</code>, then restart the
              API.
            </p>
          </CardContent>
        </Card>
      )}

      {!health.testMode && health.liveCallReadiness?.ready && (
        <Card
          className={
            health.twilioAccount?.type === 'Trial'
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-primary/30 bg-primary/5'
          }
        >
          <CardContent className="space-y-2 p-4 text-sm">
            <strong>Live Twilio mode</strong> — calling from{' '}
            <code className="text-xs">{health.twilioFromNumber ?? 'unknown'}</code>
            {health.twilioAccount?.friendlyName && (
              <span> · {health.twilioAccount.friendlyName}</span>
            )}
            {health.callMode === 'ai' && health.aiCallConfigured && (
              <span> · AI calls ({health.callAiModel ?? 'OpenAI'})</span>
            )}
            {health.twilioAccount?.type === 'Trial' ? (
              <p className="text-muted-foreground">
                Twilio reports <strong>Trial</strong> — only{' '}
                <a
                  href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  verified numbers
                </a>{' '}
                can be called. Upgrade billing or use test mode.
              </p>
            ) : health.twilioAccount?.type === 'Full' ? (
              <p className="text-muted-foreground">
                Paid account — outbound calls to patient numbers are enabled.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  )
}
