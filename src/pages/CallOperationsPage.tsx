import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AddPatientForm } from '@/components/calls/AddPatientForm'
import { CallJobsTable } from '@/components/calls/CallJobsTable'
import { CallOpsToolbar } from '@/components/calls/CallOpsToolbar'
import { useCallOperations } from '@/hooks/useCallOperations'
import { Badge } from '@/components/ui/badge'

export function CallOperationsPage() {
  const [searchParams] = useSearchParams()
  const isRealMode = searchParams.get('mode') === 'real'

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
  } = useCallOperations()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Excel Auto-Call</h1>
          <p className="text-sm text-muted-foreground">
            {isRealMode ? 'Real backend mode' : 'Upload patients, start outbound calls, export results'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Prefer the main view?{' '}
            <Link to="/dashboard" className="text-primary underline">
              Open dashboard
            </Link>
          </p>
        </div>
        <CallOpsToolbar
          health={health}
          loading={loading}
          onRefresh={() => void refresh()}
          onUpload={onUpload}
        />
      </div>

      {!health?.ok && !loading && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            Start the backend: <code className="text-xs">cd server && npm run dev</code>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add patient manually</CardTitle>
          <CardDescription>Phone, DOB, medication, reason, and optional notes</CardDescription>
        </CardHeader>
        <CardContent>
          <AddPatientForm
            disabled={!health?.ok}
            onSubmit={async (input) => onCreate(input)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff follow-ups</CardTitle>
          <CardDescription>{tasks.length} open tasks from escalations</CardDescription>
        </CardHeader>
        <CardContent className="max-h-48 overflow-auto space-y-2 text-sm">
          {tasks.length === 0 ? (
            <p className="text-muted-foreground">No staff tasks yet.</p>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="flex justify-between border-b border-border pb-1">
                <span>{t.patientName}</span>
                <Badge variant="outline">{t.priority}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call jobs</CardTitle>
          <CardDescription>{queued.length} ready to dial · {jobs.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          <CallJobsTable
            jobs={jobs}
            callingId={callingId}
            health={health}
            onStart={(id) => void onStart(id)}
            onRetry={(id) => void onRetry(id)}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Demo: <Link to="/workflows?demo=live" className="text-primary underline">/workflows?demo=live</Link>.
        Dashboard: <Link to="/dashboard" className="text-primary underline">/dashboard</Link>.
      </p>
    </div>
  )
}
