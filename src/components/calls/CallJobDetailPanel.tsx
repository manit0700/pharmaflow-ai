import { useState } from 'react'
import { Ban, CheckCircle2, FileText, Save, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { CallJob } from '@/utils/api'
import { cn } from '@/lib/utils'

type ChatMessage = { role: string; content: string }

function parseMessages(json: string | null): ChatMessage[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as ChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatRole(role: string) {
  if (role === 'assistant') return 'Pharmacy AI'
  if (role === 'user') return 'Patient'
  if (role === 'system') return 'System'
  return role
}

export function CallJobDetailPanel({
  job,
  onClose,
  onPreviewScript,
  onSaveNotes,
  onResolve,
  onAddDoNotCall,
}: {
  job: CallJob
  onClose: () => void
  onPreviewScript?: (id: string) => Promise<{ script: string }>
  onSaveNotes?: (id: string, staffNotes: string) => void
  onResolve?: (id: string, staffNotes?: string) => void
  onAddDoNotCall?: (job: CallJob) => void
}) {
  const messages = parseMessages(job.messagesJson)
  const [staffNotes, setStaffNotes] = useState(job.staffNotes ?? '')
  const [script, setScript] = useState<string | null>(null)
  const safetyFlags = (() => {
    if (!job.safetyFlagsJson) return [] as string[]
    try {
      const parsed = JSON.parse(job.safetyFlagsJson) as unknown
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  })()

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">{job.patientName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.phoneNumber} · {job.medicationName}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Call reason</dt>
            <dd className="capitalize">{job.callReason.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Call status</dt>
            <dd className="capitalize">{job.callStatus.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">DOB</dt>
            <dd>{job.dob}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Validation</dt>
            <dd>
              <Badge variant={job.validationStatus === 'valid' ? 'success' : 'destructive'}>
                {job.validationStatus}
              </Badge>
            </dd>
          </div>
          {job.resolvedAt && (
            <div>
              <dt className="text-xs text-muted-foreground">Resolved</dt>
              <dd>{new Date(job.resolvedAt).toLocaleString()}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap gap-2">
          {onPreviewScript && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const result = await onPreviewScript(job.id)
                setScript(result.script)
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              Preview script
            </Button>
          )}
          {onResolve && (
            <Button size="sm" variant="outline" onClick={() => onResolve(job.id, staffNotes)}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark resolved
            </Button>
          )}
          {onAddDoNotCall && (
            <Button size="sm" variant="outline" onClick={() => onAddDoNotCall(job)}>
              <Ban className="h-3.5 w-3.5" />
              Do not call
            </Button>
          )}
        </div>

        {safetyFlags.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="text-xs font-medium text-warning">Safety flags</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
              {safetyFlags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </div>
        )}

        {script && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Script preview</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
              {script}
            </pre>
          </div>
        )}

        {(job.patientResponse || job.aiSummary) && (
          <div className="rounded-md border border-border/60 bg-muted/40 p-3 space-y-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Patient answer</p>
              <p>{job.patientResponse ?? '—'}</p>
            </div>
            {job.aiSummary && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Staff summary</p>
                <p>{job.aiSummary}</p>
              </div>
            )}
          </div>
        )}

        {job.notes && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Notes</p>
            <p>{job.notes}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Staff notes</p>
          <Textarea
            value={staffNotes}
            onChange={(e) => setStaffNotes(e.target.value)}
            placeholder="Add internal staff notes..."
            rows={3}
          />
          {onSaveNotes && (
            <Button size="sm" variant="outline" onClick={() => onSaveNotes(job.id, staffNotes)}>
              <Save className="h-3.5 w-3.5" />
              Save notes
            </Button>
          )}
        </div>

        {job.errorMessage && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
            {job.errorMessage}
          </div>
        )}

        {job.followUpReason && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Follow-up reason</p>
            <p>{job.followUpReason}</p>
          </div>
        )}

        {messages.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Call conversation</p>
            <div className="max-h-64 space-y-2 overflow-auto rounded-md border border-border/60 p-2">
              {messages
                .filter((m) => m.role !== 'system')
                .map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm max-w-[90%]',
                      m.role === 'user' && 'bg-muted',
                      m.role === 'assistant' && 'ml-auto bg-primary/10',
                    )}
                  >
                    <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      {formatRole(m.role)}
                    </p>
                    {m.content}
                  </div>
                ))}
            </div>
          </div>
        )}

        {job.twilioCallSid && (
          <p className="text-xs text-muted-foreground font-mono">Twilio SID: {job.twilioCallSid}</p>
        )}

        {job.callEvents && job.callEvents.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Attempt history</p>
            <div className="max-h-48 overflow-auto rounded-md border border-border/60">
              {job.callEvents.map((event) => (
                <div key={event.id} className="border-b border-border/50 px-3 py-2 text-xs last:border-b-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{event.eventType.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                  {event.twilioCallSid && (
                    <p className="mt-1 font-mono text-muted-foreground">{event.twilioCallSid}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
