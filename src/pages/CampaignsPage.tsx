import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  addCampaignPatients,
  createCampaign,
  fetchCallJobs,
  fetchCampaign,
  fetchCampaigns,
  startCampaign,
  type CampaignDetail,
  type CampaignSummary,
} from '@/utils/campaignApi'
import type { CallJob } from '@/utils/api'
import { callStatusLabel } from '@/utils/callStatus'

const ELIGIBLE_STATUSES = new Set(['queued', 'pending', 'scheduled'])

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [selected, setSelected] = useState<CampaignDetail | null>(null)
  const [jobs, setJobs] = useState<CallJob[]>([])
  const [name, setName] = useState('')
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [startingId, setStartingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [campaignList, jobList] = await Promise.all([fetchCampaigns(), fetchCallJobs()])
    setCampaigns(campaignList)
    setJobs(jobList)
    if (selected) {
      setSelected(await fetchCampaign(selected.id).catch(() => null))
    }
  }, [selected])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh().catch(() => toast.error('Could not load campaigns')).finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(id)
  }, [refresh])

  const eligibleJobs = useMemo(() => {
    const existingIds = new Set(selected?.patients.map((p) => p.callJobId) ?? [])
    return jobs.filter((job) => ELIGIBLE_STATUSES.has(job.callStatus) && !existingIds.has(job.id))
  }, [jobs, selected])

  async function handleCreate() {
    if (!name.trim()) return
    const campaign = await createCampaign(name.trim())
    setName('')
    await refresh()
    setSelected(await fetchCampaign(campaign.id))
    toast.success('Campaign created')
  }

  async function handleSelect(id: string) {
    setSelected(await fetchCampaign(id))
    setSelectedJobIds(new Set())
  }

  async function handleAddPatients() {
    if (!selected || selectedJobIds.size === 0) return
    const detail = await addCampaignPatients(selected.id, [...selectedJobIds])
    setSelected(detail)
    setSelectedJobIds(new Set())
    await refresh()
    toast.success('Patients added to campaign')
  }

  async function handleStart(id: string) {
    setStartingId(id)
    try {
      const result = await startCampaign(id)
      await refresh()
      toast.success(`Campaign started: ${result.started} calls queued, ${result.failed} failed`)
    } finally {
      setStartingId(null)
    }
  }

  function toggleJob(id: string) {
    setSelectedJobIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted-foreground">Group queued patients and start outbound campaigns.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create campaign</CardTitle>
          <CardDescription>Name a refill or outreach batch before adding patients.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="July refill reminders" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => void handleCreate()} disabled={!name.trim()}>Create</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign list</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading campaigns…</p>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            ) : campaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => void handleSelect(campaign.id)}
                className="w-full rounded-md border border-border p-3 text-left hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{campaign.name}</span>
                  <Badge variant={campaign.status === 'running' ? 'default' : 'secondary'}>{campaign.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{campaign.patientCount} patients</p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleStart(campaign.id)
                  }}
                  disabled={startingId === campaign.id || campaign.patientCount === 0}
                >
                  {startingId === campaign.id ? 'Starting…' : 'Start Campaign'}
                </Button>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selected ? selected.name : 'Campaign details'}</CardTitle>
            <CardDescription>{selected ? 'Patients and call status for this campaign.' : 'Select a campaign to view details.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? null : (
              <>
                <div className="rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left">Patient</th>
                        <th className="px-3 py-2 text-left">Medication</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.patients.length === 0 ? (
                        <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No patients added.</td></tr>
                      ) : selected.patients.map((p) => (
                        <tr key={p.id} className="border-b border-border/60">
                          <td className="px-3 py-2">{p.callJob.patientName}</td>
                          <td className="px-3 py-2">{p.callJob.medicationName}</td>
                          <td className="px-3 py-2">{callStatusLabel(p.callJob.callStatus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Add patients</p>
                    <Button size="sm" onClick={() => void handleAddPatients()} disabled={selectedJobIds.size === 0}>
                      Add selected
                    </Button>
                  </div>
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    {eligibleJobs.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">No queued or pending patients available.</p>
                    ) : eligibleJobs.map((job) => (
                      <label key={job.id} className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 text-sm">
                        <input type="checkbox" checked={selectedJobIds.has(job.id)} onChange={() => toggleJob(job.id)} />
                        <span className="flex-1">
                          <span className="font-medium">{job.patientName}</span>
                          <span className="ml-2 text-muted-foreground">{job.medicationName}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{callStatusLabel(job.callStatus)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
