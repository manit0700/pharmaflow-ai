import {
  fetchCallJobs,
  type CallJob,
} from '@/utils/api'

const BASE = (() => {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  const hasExplicit = raw !== undefined && String(raw).trim() !== ''
  const base = (raw ?? '').replace(/\/$/, '')
  if (import.meta.env.DEV && !hasExplicit) return ''
  if (typeof window !== 'undefined' && base === window.location.origin) return ''
  return base
})()

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, init)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export interface CampaignSummary {
  id: string
  name: string
  status: string
  patientCount: number
  createdAt: string
  updatedAt: string
}

export interface CampaignPatient {
  id: string
  campaignId: string
  callJobId: string
  callJob: CallJob
  createdAt: string
}

export interface CampaignDetail extends Omit<CampaignSummary, 'patientCount'> {
  patients: CampaignPatient[]
}

export { fetchCallJobs }

export async function fetchCampaigns(): Promise<CampaignSummary[]> {
  return request<CampaignSummary[]>('/campaigns')
}

export async function createCampaign(name: string): Promise<CampaignSummary> {
  return request<CampaignSummary>('/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function fetchCampaign(id: string): Promise<CampaignDetail> {
  return request<CampaignDetail>(`/campaigns/${id}`)
}

export async function addCampaignPatients(id: string, callJobIds: string[]): Promise<CampaignDetail> {
  return request<CampaignDetail>(`/campaigns/${id}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callJobIds }),
  })
}

export async function startCampaign(id: string): Promise<{ started: number; failed: number }> {
  return request<{ started: number; failed: number }>(`/campaigns/${id}/start`, { method: 'POST' })
}
