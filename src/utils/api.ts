/**
 * Dev: default same-origin /api → Vite proxy to 127.0.0.1:4002.
 * Set VITE_API_BASE_URL in .env.local only when you need a direct API host.
 */
function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  const hasExplicit = raw !== undefined && String(raw).trim() !== ''
  const base = (raw ?? '').replace(/\/$/, '')

  if (import.meta.env.DEV && !hasExplicit) return ''

  if (typeof window !== 'undefined' && base === window.location.origin) {
    return ''
  }
  return base
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
  transcriptJson: string | null
  messagesJson: string | null
  aiConfidence: number | null
  resolutionStatus: string | null
  staffFollowUpNeeded: boolean
  followUpReason: string | null
  createdAt: string
}

export interface StaffTask {
  id: string
  callJobId?: string | null
  callJob?: {
    id: string
    callReason?: string | null
    callStatus?: string | null
    callAttemptedAt?: string | null
    callCompletedAt?: string | null
    patientResponse?: string | null
    followUpReason?: string | null
  } | null
  patientName: string
  phoneNumber: string
  medicationName?: string | null
  taskType: string
  priority: string
  status: string
  sourceWorkflow?: string | null
  assignedTeam?: string | null
  dueDate?: string | null
  dueTime?: string | null
  issueSummary?: string | null
  activityJson?: string | null
  aiSummary?: string | null
  taskActivities?: TaskActivity[]
  notes: string | null
  createdAt: string
  updatedAt?: string | null
}

export interface TaskActivity {
  id: string
  activityType: string
  message: string
  actor: string
  createdAt: string
}

export interface HealthResponse {
  ok: boolean
  configSource?: 'local.config.json' | 'env'
  apiVersion?: number
  callMode?: 'dtmf' | 'ai'
  aiCallConfigured?: boolean | null
  callAiModel?: string | null
  features?: {
    createCallJob?: boolean
    simulatedCalls?: boolean
    dtmfScripts?: boolean
    aiConversation?: boolean
  }
  twilioConfigured: boolean
  twilioAuthMode?: string
  twilioAccount?: { type: string; friendlyName: string; status: string } | null
  twilioFromNumber?: string
  testMode: boolean
  publicBaseUrl?: string
  port?: number
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

export async function startCall(job: CallJob): Promise<CallJob> {
  return request<CallJob>(`/call-jobs/${job.id}/start-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job }),
  })
}

export async function retryCall(job: CallJob): Promise<CallJob> {
  return request<CallJob>(`/call-jobs/${job.id}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job }),
  })
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

export interface AnalyticsResponse {
  totalJobs: number
  attempted: number
  completed: number
  escalated: number
  withPatientResponse: number
  byReason: { reason: string; count: number }[]
  byStatus: { status: string; count: number }[]
  series: { date: string; calls: number; completed: number; escalations: number }[]
  aiVsHuman: { name: string; value: number; fill: string }[]
  channelMix: { name: string; calls: number }[]
  completionByReason: { reason: string; total: number; completed: number }[]
}

export interface AuditEventItem {
  id: string
  timestamp: string
  actor: string
  action: string
  resource: string
  severity: 'info' | 'warning' | 'critical'
  details: string
}

export interface AuditResponse {
  events: AuditEventItem[]
  stats: {
    callEvents: number
    staffTasks: number
    outboundCalls: number
    followUpsNeeded: number
  }
}

export async function fetchAnalytics(): Promise<AnalyticsResponse> {
  return request<AnalyticsResponse>('/analytics')
}

export async function fetchAuditEvents(): Promise<AuditResponse> {
  return request<AuditResponse>('/audit-events')
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
