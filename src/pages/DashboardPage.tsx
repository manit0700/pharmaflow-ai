import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/components/shared/KpiCard'
import { AddPatientForm } from '@/components/calls/AddPatientForm'
import { CallJobsTable } from '@/components/calls/CallJobsTable'
import { CallOpsToolbar } from '@/components/calls/CallOpsToolbar'
import { useCallOperations } from '@/hooks/useCallOperations'
import type { KPIStat } from '@/types'
import { Badge } from '@/components/ui/badge'

export function DashboardPage() {
  const {
    health,
    jobs,
    tasks,
    loading,
    callingId,
    refresh,
    onUpload,
    onCreate,
    onStart,
    onRetry,
    queued,
    completed,
    invalid,
  } = useCallOperations()

  const kpis: KPIStat[] = [
    {
      id: 'queue',
      label: 'In queue',
      value: String(queued.length),
      change: `${jobs.length} total jobs`,
      trend: 'neutral',
    },
    {
      id: 'completed',
      label: 'Completed calls',
      value: String(completed.length),
      change: completed.length > 0 ? 'Ready for export' : 'No completions yet',
      trend: completed.length > 0 ? 'up' : 'neutral',
    },
    {
      id: 'valid',
      label: 'Valid patients',
      value: String(jobs.filter((j) => j.validationStatus === 'valid').length),
      change: invalid.length > 0 ? `${invalid.length} need review` : 'All rows valid',
      trend: invalid.length > 0 ? 'down' : 'up',
    },
    {
      id: 'tasks',
      label: 'Staff follow-ups',
      value: String(tasks.length),
      change: tasks.length > 0 ? 'From escalations' : 'No open tasks',
      trend: tasks.length > 0 ? 'down' : 'neutral',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call jobs</h1>
          <p className="text-sm text-muted-foreground">
            {queued.length} patient{queued.length === 1 ? '' : 's'} in queue · outbound Excel auto-call
          </p>
        </div>
        <CallOpsToolbar
          health={health}
          loading={loading}
          onRefresh={() => void refresh()}
          onUpload={onUpload}
        />
      </div>

      {health?.ok && health.testMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-sm">
            <strong>Test call mode</strong> — Call simulates instantly (no Twilio, no 403). For real
            phone rings, set <code className="text-xs">AUTO_CALL_TEST_MODE=false</code> in{' '}
            <code className="text-xs">server/.env</code> and verify numbers in Twilio.
          </CardContent>
        </Card>
      )}

      {health?.ok && !health.testMode && (
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
              <span> · account: {health.twilioAccount.friendlyName}</span>
            )}
            {health.twilioAccount?.type === 'Trial' ? (
              <p className="text-muted-foreground">
                Twilio still reports this account as <strong>Trial</strong> — you can only call{' '}
                <a
                  href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  verified numbers
                </a>
                . Upgrade billing in Twilio Console to call any US number, or set{' '}
                <code>AUTO_CALL_TEST_MODE=true</code> to simulate calls.
              </p>
            ) : health.twilioAccount?.type === 'Full' ? (
              <p className="text-muted-foreground">
                Paid Twilio account detected — you can call patient numbers without verifying each
                one (normal carrier rules still apply).
              </p>
            ) : (
              <p className="text-muted-foreground">
                Could not read account type from Twilio. If calls fail, confirm{' '}
                <code>TWILIO_ACCOUNT_SID</code>, API key, and <code>TWILIO_PHONE_NUMBER</code> are
                all from the same pharmacy account, then redeploy Vercel.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!health?.ok && !loading && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              <strong>Cannot fetch / API offline.</strong> Start both servers:
            </p>
            <code className="block text-xs">cd ~/Projects/pharmaflow-ai && npm run dev:all</code>
            <p className="text-muted-foreground">
              Open the app at <strong>http://localhost:5173/dashboard</strong> (use the port Vite prints
              if different). API should be at http://localhost:4002/api/health
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.id} stat={k} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add patient manually</CardTitle>
          <CardDescription>
            Enter phone number, DOB, medication, and call reason — same fields as Excel import
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddPatientForm
            disabled={!health?.ok}
            onSubmit={async (input) => onCreate(input)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Call jobs</CardTitle>
              <CardDescription>{jobs.length} patients in queue</CardDescription>
            </div>
            <Link
              to="/calls?mode=real"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Full import view →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <CallJobsTable
            jobs={jobs}
            callingId={callingId}
            onStart={(id) => void onStart(id)}
            onRetry={(id) => void onRetry(id)}
          />
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff follow-ups</CardTitle>
            <CardDescription>Escalations requiring pharmacy staff</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {tasks.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="font-medium">{t.patientName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground capitalize">{t.taskType.replace(/_/g, ' ')}</span>
                  <Badge variant="outline">{t.priority}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Demo mode:{' '}
        <Link to="/workflows?demo=live" className="text-primary underline">
          /workflows?demo=live
        </Link>
        . Recordings:{' '}
        <Link to="/conversations" className="text-primary underline">
          Call Recordings
        </Link>
        .
      </p>
    </div>
  )
}
