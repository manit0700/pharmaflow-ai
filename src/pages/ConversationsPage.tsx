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
import { formatDuration, formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

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
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
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
          Real outbound calls from your queue — transcripts, patient answers, and call metadata
        </p>
      </div>

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
              <Link to="/dashboard" className="text-primary underline">
                Add patients and start calling
              </Link>{' '}
              to see history here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:min-h-[calc(100vh-14rem)]">
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
                      <Mic className="h-3 w-3 text-primary shrink-0" />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground capitalize">
                      {c.workflowName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {c.extractedData.patientResponse || c.messages[0]?.content || 'No transcript'}
                    </p>
                    <div className="mt-2 flex items-center gap-1">
                      <ResolutionBadge status={c.resolutionStatus} />
                      <Badge variant="outline" className="text-[10px]">
                        {formatDuration(c.durationSec)}
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
                      {selected.workflowName} · {formatTime(selected.startedAt)}
                    </p>
                  </div>
                  <ResolutionBadge status={selected.resolutionStatus} />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary" className="capitalize">
                    {selected.requestType.replace('_', ' ')}
                  </Badge>
                  {selected.escalationReason && (
                    <Badge variant="warning">Follow-up: {selected.escalationReason}</Badge>
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
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="text-sm space-y-2">
                    <dl className="grid gap-2">
                      {Object.entries(selected.extractedData).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-border py-2">
                          <dt className="text-muted-foreground capitalize">{k}</dt>
                          <dd className="font-medium text-right max-w-[60%] truncate">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-xs text-muted-foreground pt-2">
                      Twilio recording playback requires enabling call recording on your Twilio account.
                      Transcript replay uses browser speech until a recording URL is wired.
                    </p>
                  </TabsContent>
                  <TabsContent value="transcript" className="space-y-3 max-h-64 overflow-auto">
                    {selected.messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No transcript stored for this call.</p>
                    ) : (
                      selected.messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            'rounded-lg px-3 py-2 text-sm max-w-[85%]',
                            m.role === 'patient' && 'bg-muted ml-0',
                            m.role === 'ai' && 'bg-primary/10 ml-auto',
                            m.role === 'staff' && 'bg-warning/10 border border-warning/30',
                          )}
                        >
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                            {m.role}
                          </p>
                          {m.content}
                        </div>
                      ))
                    )}
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
