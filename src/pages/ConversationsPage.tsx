import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mic, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ResolutionBadge } from '@/components/shared/StatusBadge'
import { CallRecordingPlayer } from '@/components/conversations/CallRecordingPlayer'
import { useConversationList } from '@/hooks/useConversationList'
import { useLiveDemo } from '@/context/LiveDemoContext'
import { formatDuration, formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const filters: { id: string; label: string; match?: (c: ReturnType<typeof useConversationList>[0]) => boolean }[] = [
  { id: 'all', label: 'All' },
  { id: 'recorded', label: 'Has recording', match: (c) => !!c.recording },
  { id: 'resolved', label: 'Connected', match: (c) => c.resolutionStatus === 'resolved' },
  { id: 'escalated', label: 'Callback needed', match: (c) => c.resolutionStatus === 'escalated' },
  { id: 'pending', label: 'Voicemail / retry', match: (c) => c.resolutionStatus === 'pending' },
  { id: 'refill', label: 'Refill', match: (c) => c.requestType === 'refill' },
]

export function ConversationsPage() {
  const allConversations = useConversationList()
  const { isLive, liveRecordings } = useLiveDemo()
  const [selectedId, setSelectedId] = useState(allConversations[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    const f = filters.find((x) => x.id === filter)
    return allConversations.filter((c) => {
      const matchesFilter = !f?.match || f.match(c)
      const matchesQuery =
        !query ||
        c.patientFirstName.toLowerCase().includes(query.toLowerCase()) ||
        c.recording.fileName.toLowerCase().includes(query.toLowerCase()) ||
        c.messages.some((m) => m.content.toLowerCase().includes(query.toLowerCase()))
      return matchesFilter && matchesQuery
    })
  }, [allConversations, query, filter])

  const selected = allConversations.find((c) => c.id === selectedId) ?? filtered[0]

  const stats = {
    total: allConversations.length,
    recorded: allConversations.filter((c) => c.recording).length,
    resolved: allConversations.filter((c) => c.resolutionStatus === 'resolved').length,
    liveNew: liveRecordings.length,
    avgDuration: Math.round(
      allConversations.filter((c) => c.durationSec > 0).reduce((a, c) => a + c.durationSec, 0) /
        Math.max(1, allConversations.filter((c) => c.durationSec > 0).length),
    ),
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outbound Calls & Recordings</h1>
        <p className="text-sm text-muted-foreground">
          Every completed outbound call includes a stored recording, waveform, and synced transcript (demo).
        </p>
        {isLive && liveRecordings.length > 0 && (
          <p className="text-xs text-primary mt-1">
            {liveRecordings.length} new recording{liveRecordings.length > 1 ? 's' : ''} from this live demo session
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Total calls', value: stats.total },
          { label: 'With recording', value: stats.recorded },
          { label: 'Live session new', value: stats.liveNew },
          { label: 'Avg duration', value: formatDuration(stats.avgDuration) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:min-h-[calc(100vh-14rem)]">
        <Card className="flex w-full flex-col lg:w-80 lg:shrink-0">
          <CardHeader className="pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search recordings…"
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
                    filter === f.id ? 'bg-primary/15 border-primary text-accent-fg' : 'border-border text-muted-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-2 pt-0 space-y-1">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No recordings match your filters.</p>
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
                    <Mic className="h-3 w-3 text-primary shrink-0" />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground font-mono truncate">
                    {c.recording.fileName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{c.messages[0]?.content}</p>
                  <div className="mt-2 flex items-center gap-1">
                    <ResolutionBadge status={c.resolutionStatus} />
                    <Badge variant="outline" className="text-[10px]">
                      {formatDuration(c.recording.durationSec)}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="min-w-0 flex-1">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>{selected.patientFirstName}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selected.workflowName} · {formatTime(selected.startedAt)} · AI confidence{' '}
                    {(selected.aiConfidence * 100).toFixed(0)}%
                  </p>
                </div>
                <ResolutionBadge status={selected.resolutionStatus} />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary" className="capitalize">
                  {selected.requestType.replace('_', ' ')}
                </Badge>
                {selected.escalationReason && (
                  <Badge variant="warning">Escalation: {selected.escalationReason}</Badge>
                )}
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
                  <TabsTrigger value="recording">Recording</TabsTrigger>
                  <TabsTrigger value="transcript">Full transcript</TabsTrigger>
                  <TabsTrigger value="entities">Entities</TabsTrigger>
                  <TabsTrigger value="audit">Audit trail</TabsTrigger>
                </TabsList>
                <TabsContent value="recording" className="text-sm text-muted-foreground space-y-2">
                  <p>Stored at: {formatTime(selected.recording.recordedAt)}</p>
                  <p>File: {selected.recording.fileName}</p>
                  <p>Duration: {formatDuration(selected.recording.durationSec)}</p>
                  <p className="text-xs">
                    Demo only — playback reads the transcript with your browser voice engine. In production this would
                    stream encrypted audio from Twilio storage.
                  </p>
                </TabsContent>
                <TabsContent value="transcript" className="space-y-3 max-h-64 overflow-auto">
                  {selected.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm max-w-[85%]',
                        m.role === 'patient' && 'bg-muted ml-0',
                        m.role === 'ai' && 'bg-primary/10 ml-auto',
                        m.role === 'staff' && 'bg-warning/10 border border-warning/30',
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">{m.role}</p>
                      {m.content}
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="entities">
                  <dl className="grid gap-2 text-sm">
                    {Object.entries(selected.extractedData).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-border py-2">
                        <dt className="text-muted-foreground capitalize">{k}</dt>
                        <dd className="font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </TabsContent>
                <TabsContent value="audit">
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li>Recording archived — mock retention {selected.recording.retentionDays} days</li>
                    <li>Consent: {selected.recording.consentCaptured ? 'captured' : 'missing'}</li>
                    <li>Workflow: {selected.workflowName}</li>
                    <li>PHI access logged (demo)</li>
                  </ul>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">
              {isLive ? (
                <>Waiting for first completed call — or <Link to="/workflows" className="text-primary underline">run live demo</Link></>
              ) : (
                'Select a call recording from the list'
              )}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
