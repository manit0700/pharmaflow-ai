/**
 * Dev: use same-origin /api → Vite proxies to localhost:4002 (avoids "Failed to fetch").
 * Override with VITE_API_BASE_URL in .env.local if needed.
 */
const ENV_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function getApiBase() {
  if (typeof window !== 'undefined' && ENV_BASE === window.location.origin) {
    return ''
  }
  if (import.meta.env.DEV) return ENV_BASE
  return ENV_BASE
}

const BASE = getApiBase()

export interface CallJob {
  id: string
  patientName: string
  phoneNumber: string
  dob: string
  medicationName: string
  callReason: string
  notes: string | null
  validationStatus: string
  validationError: string | null
  callStatus: string
  twilioCallSid: string | null
  callAttemptedAt: string | null
  callCompletedAt: string | null
  callDuration: number | null
  patientResponse: string | null
  aiSummary: string | null
  errorMessage: string | null
  staffFollowUpNeeded: boolean
  followUpReason: string | null
  createdAt: string
}

export interface StaffTask {
  id: string
  patientName: string
  phoneNumber: string
  taskType: string
  priority: string
  status: string
  notes: string | null
  createdAt: string
}

export interface HealthResponse {
  ok: boolean
  apiVersion?: number
  features?: { createCallJob?: boolean }
  twilioConfigured: boolean
  twilioAuthMode?: string
  twilioAccount?: { type: string; friendlyName: string; status: string } | null
  twilioFromNumber?: string
  testMode: boolean
  publicBaseUrl?: string
  liveCallReadiness?: {
    ready: boolean
    issues: string[]
    publicBaseUrl: string
  }
}

function apiUrl(path: string) {
  return `${BASE}/api${path}`
}

function cannotReachApiMessage(): string {
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app')) {
    return `Cannot reach the deployed API. Open ${window.location.origin}/api/health to verify the backend, then hard-refresh this page.`
  }

  if (BASE.startsWith('https://')) {
    return `Cannot reach the API (${BASE}). Open ${BASE}/api/health to verify the backend is online.`
  }

  const target = BASE || 'this page’s /api proxy -> 127.0.0.1:4002'
  return `Cannot reach the API (${target}). Run: cd ~/Projects/pharmaflow-ai && npm run dev:all`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), init)
  } catch {
    throw new Error(cannotReachApiMessage())
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    if (res.status === 404 && init?.method === 'POST' && path === '/call-jobs') {
      throw new Error(
        'Add-patient API not found. Restart the backend: stop the terminal running the API, then run npm run dev:all',
      )
    }
    if (path.includes('start-call') && err.error) {
      const lower = err.error.toLowerCase()
      if (lower.includes('localhost') || lower.includes('ngrok') || lower.includes('not a valid url')) {
        throw new Error(err.error)
      }
      if (err.error.includes('403')) {
        throw new Error(
          'Twilio trial blocked this call (403). Verify the patient phone in Twilio Console, or set AUTO_CALL_TEST_MODE=true for simulated calls.',
        )
      }
    }
    throw new Error(err.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export async function fetchCallJobs(): Promise<CallJob[]> {
  return request<CallJob[]>('/call-jobs')
}

export interface CreateCallJobInput {
  patientName: string
  phoneNumber: string
  dob: string
  medicationName: string
  callReason: string
  notes?: string
}

export async function createCallJob(input: CreateCallJobInput): Promise<CallJob> {
  return request<CallJob>('/call-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientName: input.patientName,
      phoneNumber: input.phoneNumber,
      dob: input.dob,
      medicationName: input.medicationName,
      callReason: input.callReason,
      notes: input.notes || null,
    }),
  })
}

export async function startCall(jobId: string): Promise<CallJob> {
  return request<CallJob>(`/call-jobs/${jobId}/start-call`, { method: 'POST' })
}

export async function retryCall(jobId: string): Promise<CallJob> {
  return request<CallJob>(`/call-jobs/${jobId}/retry`, { method: 'POST' })
}

export async function importExcel(file: File): Promise<{ imported: number; valid: number; invalid: number }> {
  const form = new FormData()
  form.append('file', file)
  let res: Response
  try {
    res = await fetch(apiUrl('/import/excel'), { method: 'POST', body: form })
  } catch {
    throw new Error(cannotReachApiMessage())
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Upload failed')
  }
  return res.json()
}

export function exportExcelUrl(): string {
  return `${BASE}/api/call-jobs/export`
}

export async function fetchTasks(): Promise<StaffTask[]> {
  return request<StaffTask[]>('/tasks')
}

export async function updateTask(
  id: string,
  data: { status?: string; notes?: string },
): Promise<StaffTask> {
  return request<StaffTask>(`/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
