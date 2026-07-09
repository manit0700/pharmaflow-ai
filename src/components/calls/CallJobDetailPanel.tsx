import { useState } from 'react'
import { X, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { CallJob } from '@/utils/api'
import { updateStaffNotes } from '@/utils/api'
import { buildLiveFeed } from '@/utils/liveTranscript'
import { cn } from '@/lib/utils'

type ChatMessage = { role: string; content: string }
type RxItem = { name: string; cost: number }

function parsePrescriptions(json: string | null): RxItem[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as RxItem[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

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
  onJobUpdate,
}: {
  job: CallJob
  onClose: () => void
  onJobUpdate?: (updated: CallJob) => void
}) {
  const [notes, setNotes] = useState(job.staffNotes ?? '')
  const [saving, setSaving] = useState(false)

  async function saveNotes() {
    if (notes === (job.staffNotes ?? '')) return
    setSaving(true)
    try {
      const updated = await updateStaffNotes(job.id, notes)
      onJobUpdate?.(updated)
    } finally {
      setSaving(false)
    }
  }

  const messages = parseMessages(job.messagesJson)
  const liveFeed = buildLiveFeed(job)
  const rxList = parsePrescriptions(job.prescriptionsJson)
  const conversationItems =
    liveFeed.length > 0
      ? liveFeed.map((item) => ({
          role: item.speaker === 'pharmacy' ? 'assistant' : item.speaker,
          content: item.text,
        }))
      : messages.filter((m) => m.role !== 'system')

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">{job.patientName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.phoneNumber} · {rxList ? rxList.map((r) => r.name).join(', ') : job.medicationName}
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
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground mb-1">
              Prescriptions {rxList && rxList.length > 1 ? `(${rxList.length})` : ''}
            </dt>
            <dd>
              {rxList ? (
                <ul className="space-y-0.5">
                  {rxList.map((rx, i) => (
                    <li key={i} className="flex justify-between text-sm">
                      <span>{rx.name}</span>
                      {rx.cost > 0 && <span className="text-green-700 dark:text-green-400 font-medium">${rx.cost.toFixed(2)}</span>}
                    </li>
                  ))}
                  {job.prescriptionCost != null && rxList.length > 1 && (
                    <li className="flex justify-between text-sm font-semibold border-t border-border/60 pt-1 mt-1">
                      <span>Total due</span>
                      <span className="text-green-700 dark:text-green-400">${job.prescriptionCost.toFixed(2)}</span>
                    </li>
                  )}
                </ul>
              ) : (
                <span>{job.medicationName}{job.rxNumber ? ` · Rx #${job.rxNumber}` : ''}{job.prescriptionCost != null ? ` — $${job.prescriptionCost.toFixed(2)}` : ''}</span>
              )}
            </dd>
          </div>
        </dl>

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

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Staff notes</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => void saveNotes()}
            placeholder="Add internal notes visible only to pharmacy staff…"
            className="min-h-[72px] resize-none text-sm"
            rows={3}
          />
          {notes !== (job.staffNotes ?? '') && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => void saveNotes()} disabled={saving}>
              <Save className="h-3 w-3" />
              {saving ? 'Saving…' : 'Save notes'}
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

        {conversationItems.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Call conversation</p>
            <div className="max-h-64 space-y-2 overflow-auto rounded-md border border-border/60 p-2">
              {conversationItems.map((m, i) => (
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
      </CardContent>
    </Card>
  )
}
