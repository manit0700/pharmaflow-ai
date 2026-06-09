import { Card, CardContent } from '@/components/ui/card'
import type { HealthResponse } from '@/utils/api'

function isDeployedSite(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app')
}

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
        <CardContent className="p-4 text-sm text-muted-foreground">Connecting to PharmaFlow API…</CardContent>
      </Card>
    )
  }

  if (!health?.ok && !loading) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="space-y-2 p-4 text-sm">
          <p>
            <strong>Cannot reach the API.</strong>{' '}
            {isDeployedSite()
              ? 'Check /api/health on this deployment, then refresh the page.'
              : 'Start the local stack with npm run dev:pc, then reload.'}
          </p>
          {!isDeployedSite() && (
            <p className="text-muted-foreground">
              API health: <code className="text-xs">http://localhost:4002/api/health</code>
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!health?.ok) return null

  const configFile =
    health.configSource === 'local.config.json' ? 'server/local.config.json' : 'server/.env'

  return (
    <>
      {health.database?.provider === 'postgres' && health.database.connected === false && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <strong>Database connection failed.</strong>{' '}
            {health.database.warning ?? 'Verify DATABASE_URL and Postgres availability.'}
          </CardContent>
        </Card>
      )}

      {health.testMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-sm">
            <strong>Test call mode</strong> — Outbound calls complete instantly without a live Twilio ring.
            Set <code className="text-xs">AUTO_CALL_TEST_MODE=false</code> for production dialing.
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
            {!isDeployedSite() && (
              <p className="text-muted-foreground">
                Set <code>PUBLIC_BASE_URL</code> to your HTTPS webhook URL in <code>{configFile}</code>, then restart
                the API.
              </p>
            )}
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
            <strong>Live outbound calling</strong> — from{' '}
            <code className="text-xs">{health.twilioFromNumber ?? 'configured number'}</code>
            {health.twilioAccount?.friendlyName && (
              <span> · {health.twilioAccount.friendlyName}</span>
            )}
            {health.callMode === 'ai' && health.aiCallConfigured && (
              <span> · AI conversations ({health.callAiModel ?? 'OpenAI'})</span>
            )}
            {health.twilioAccount?.type === 'Trial' ? (
              <p className="text-muted-foreground">
                Twilio trial account — only{' '}
                <a
                  href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  verified numbers
                </a>{' '}
                can be called until billing is enabled.
              </p>
            ) : health.twilioAccount?.type === 'Full' ? (
              <p className="text-muted-foreground">Paid Twilio account — outbound patient calls enabled.</p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  )
}
