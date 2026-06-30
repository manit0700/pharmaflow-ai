import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, MessageSquare, Mic, Phone, Search, ShieldCheck, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ResolutionBadge } from '@/components/shared/StatusBadge'
import { callStatusLabel } from '@/utils/callStatus'
import { CallRecordingPlayer } from '@/components/conversations/CallRecordingPlayer'
import { useConversationList } from '@/hooks/useConversationList'
import { formatDuration, formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const DETAIL_LABEL: Record<string, string> = {
  medication: 'Medication',
  prescriptions: 'Prescriptions',
  patientResponse: 'Patient answer',
  phone: 'Phone number',
  callStatus: 'Call status',
  dobVerified: 'Identity',
  aiTurns: 'AI turns',
}

function detailLabel(key: string): string {
  return DETAIL_LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim()
}

const filters: {
  id: string
  label: string
  match?: (c: ReturnType<typeof useConversationList>['conversations'][0]) => boolean
}[] = [
  { id: 'all', label: 'All' },
  { id: 'resolved', label: 'Answered', match: (c) => c.resolutionStatus === 'resolved' },
  { id: 'escalated', label: 'Follow-up', match: (c) => c.resolutionStatus === 'escalated' },
  { id: 'pending', label: 'No answer', match: (c) => c.resolutionStatus === 'pending' },
  { id: 'refill', label: 'Refill', match: (c) => c.requestType === 'refill' },
]

export function ConversationsPage() {
  const { conversations, loading } = useConversationList()
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    const f = filters.find((x) => x.id === filter)
    return conversations.filter((c) => {
      const matchesFilter = !f?.match || f.match(c)
      const matchesQuery =
        !query ||
        c.patientFirstName.toLowerCase().includes(query.toLowerCase()) ||
        c.extractedData.medication?.toLowerCase().includes(query.toLowerCase()) ||
        c.messages.some((m) => m.content.toLowerCase().includes(query.toLowerCase()))
      return matchesFilter && matchesQuery
    })
  }, [conversations, query, filter])

  const selected = conversations.find((c) => c.id === selectedId) ?? filtered[0]

  const stats = {
    total: conversations.length,
    resolved: conversations.filter((c) => c.resolutionStatus === 'resolved').length,
    escalated: conversations.filter((c) => c.resolutionStatus === 'escalated').length,
    avgDuration: Math.round(
      conversations.filter((c) => c.durationSec > 0).reduce((a, c) => a + c.durationSec, 0) /
        Math.max(1, conversations.filter((c) => c.durationSec > 0).length),
    ),
  }

  if (loading && conversations.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Call history</h1>
        <p className="text-sm text-muted-foreground">
          Outbound calls — transcripts, patient answers, and recordings
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Total calls', value: stats.total },
          { label: 'Answered', value: stats.resolved },
          { label: 'Follow-up', value: stats.escalated },
          { label: 'Avg duration', value: stats.avgDuration > 0 ? formatDuration(stats.avgDuration) : '—' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
            <p>No outbound calls yet.</p>
            <p>
              <Link to="/dashboard" className="text-primary underline">Add patients and start calling</Link>{' '}
              to see history here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:min-h-[calc(100vh-14rem)]">

          {/* Left sidebar — call list */}
          <Card className="flex w-full flex-col lg:w-80 lg:shrink-0">
            <CardHeader className="pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search calls…"
                  className="pl-8"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium border',
                      filter === f.id
                        ? 'bg-primary/15 border-primary text-accent-fg'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-2 pt-0 space-y-1">
              {filtered.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No calls match your filters.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      'w-full rounded-md border p-3 text-left transition-colors',
                      selected?.id === c.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-sm">{c.patientFirstName}</span>
                      <ResolutionBadge status={c.resolutionStatus} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground capitalize">{c.workflowName}</p>
                    {c.extractedData.medication && (
                      <p className="text-[10px] text-muted-foreground truncate">{c.extractedData.medication}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {c.extractedData.patientResponse || c.messages[0]?.content || 'No transcript'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />{formatDuration(c.durationSec)}
                      </span>
                      <span>{formatTime(c.startedAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Right panel — call detail */}
          {selected ? (
            <Card className="min-w-0 flex-1">
              <CardHeader className="pb-3">
                {/* Name + status */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{selected.patientFirstName}</CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      {selected.extractedData.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />{selected.extractedData.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{formatDuration(selected.durationSec)}
                      </span>
                      <span>{formatTime(selected.startedAt)}</span>
                    </div>
                  </div>
                  <ResolutionBadge status={selected.resolutionStatus} />
                </div>

                {/* Medication + badges */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant="secondary" className="capitalize">
                    {selected.requestType.replace('_', ' ')}
                  </Badge>
                  {selected.extractedData.prescriptions ? (
                    <Badge variant="outline" className="font-normal">
                      {selected.extractedData.prescriptions}
                    </Badge>
                  ) : selected.extractedData.medication ? (
                    <Badge variant="outline" className="font-normal">
                      {selected.extractedData.medication}
                    </Badge>
                  ) : null}
                  {(selected.extractedData.callStatus === 'voicemail' || selected.extractedData.callStatus === 'needs_review') && (
                    <Badge variant="warning" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {callStatusLabel(selected.extractedData.callStatus)}
                    </Badge>
                  )}
                  {selected.escalationReason && selected.extractedData.callStatus !== 'voicemail' && selected.extractedData.callStatus !== 'needs_review' && (
                    <Badge variant="warning">Follow-up: {selected.escalationReason}</Badge>
                  )}
                </div>

                {/* Identity + turns summary row */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    selected.extractedData.dobVerified === 'Verified'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                  )}>
                    {selected.extractedData.dobVerified === 'Verified'
                      ? <ShieldCheck className="h-3 w-3" />
                      : <XCircle className="h-3 w-3" />}
                    Identity {selected.extractedData.dobVerified}
                  </span>
                  {selected.extractedData.aiTurns && selected.extractedData.aiTurns !== '—' && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {selected.extractedData.aiTurns} AI turns
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${selected.recording.audioProxyUrl ? 'border-green-200 bg-green-50 text-green-700' : 'text-muted-foreground'}`}>
                    <Mic className="h-3 w-3" />
                    {selected.recording.audioProxyUrl
                      ? `Recording saved${selected.recording.realDurationSec != null ? ` · ${Math.floor(selected.recording.realDurationSec / 60)}:${String(selected.recording.realDurationSec % 60).padStart(2, '0')}` : ''}`
                      : 'No recording yet'}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <CallRecordingPlayer
                  recording={selected.recording}
                  transcript={selected.transcript}
                  patientName={selected.patientFirstName}
                />

                <Tabs defaultValue="transcript">
                  <TabsList>
                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>

                  {/* Transcript tab */}
                  <TabsContent value="transcript" className="space-y-2 max-h-96 overflow-auto pt-2">
                    {selected.messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No transcript stored for this call.</p>
                    ) : (() => {
                      let aiTurnCount = 0
                      return selected.messages.map((m) => {
                        if (m.role === 'ai') aiTurnCount++
                        const currentAiTurn = aiTurnCount
                        return (
                          <div key={m.id} className="flex flex-col gap-0.5">
                            {m.role === 'ai' && (
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground text-right pr-1">
                                Pharmacy · turn {currentAiTurn}
                              </p>
                            )}
                            {m.role === 'patient' && (
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground pl-1">
                                Patient
                              </p>
                            )}
                            {m.role === 'staff' && (
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground pl-1">
                                Staff note
                              </p>
                            )}
                            <div className={cn(
                              'rounded-xl px-3 py-2 text-sm max-w-[85%] leading-relaxed',
                              m.role === 'patient' && 'bg-muted ml-0',
                              m.role === 'ai' && 'bg-primary/10 ml-auto text-right',
                              m.role === 'staff' && 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 ml-0',
                            )}>
                              {m.content}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </TabsContent>

                  {/* Details tab */}
                  <TabsContent value="details" className="pt-2">
                    <dl className="divide-y divide-border text-sm">
                      {Object.entries(selected.extractedData)
                        .filter(([k]) => !['aiTurns', 'dobVerified'].includes(k))
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4 py-2.5">
                            <dt className="text-muted-foreground shrink-0">{detailLabel(k)}</dt>
                            <dd className={cn(
                              'font-medium text-right break-words',
                              k === 'patientResponse' && v && 'text-primary',
                            )}>
                              {k === 'patientResponse' && v
                                ? <span className="inline-flex items-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{v}
                                  </span>
                                : k === 'callStatus'
                                  ? callStatusLabel(v)
                                  : v || <span className="text-muted-foreground italic font-normal">—</span>}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  )
}
