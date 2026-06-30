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
  const provider = health.phoneProvider
  const providerName = provider?.displayName ?? 'PharmaFlow Calling'
  const carrierName = provider?.carrierName ?? 'Twilio'
  const providerAccount = provider?.account ?? health.twilioAccount
  const fromNumber = provider?.fromNumber ?? health.twilioFromNumber

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
            <strong>Live calling not ready</strong>
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

      {!health.testMode && health.callerIdStatus && !health.callerIdStatus.usable && health.liveCallReadiness?.ready && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm">
            <strong>Outbound number not ready</strong> —{' '}
            <code className="text-xs">{health.callerIdStatus.number || 'none'}</code> is not owned or
            verified on this {carrierName} account. Live calls will be blocked until this is resolved.{' '}
            <a
              href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming"
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              Buy a number
            </a>{' '}
            or{' '}
            <a
              href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              add a verified caller ID
            </a>{' '}
            in the {carrierName} Console, then update Settings.
          </CardContent>
        </Card>
      )}

      {!health.testMode && health.liveCallReadiness?.ready && (
        <Card
          className={
            providerAccount?.type === 'Trial'
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-primary/30 bg-primary/5'
          }
        >
          <CardContent className="space-y-2 p-4 text-sm">
            <strong>{providerName}</strong> — calling from{' '}
            <code className="text-xs">{fromNumber ?? 'unknown'}</code>
            <span> · carrier: {carrierName}</span>
            {providerAccount?.friendlyName && (
              <span> · {providerAccount.friendlyName}</span>
            )}
            {health.callMode === 'ai' && health.aiCallConfigured && (
              <span> · AI calls ({health.callAiModel ?? 'OpenAI'})</span>
            )}
            {health.callerIdStatus?.usable && (
              <span className="text-green-700 dark:text-green-400"> · Caller ID verified</span>
            )}
            {providerAccount?.type === 'Trial' ? (
              <p className="text-muted-foreground">
                {carrierName} reports <strong>Trial</strong> — only{' '}
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
            ) : providerAccount?.type === 'Full' ? (
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
