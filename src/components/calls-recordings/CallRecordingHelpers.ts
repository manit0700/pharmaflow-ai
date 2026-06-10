import type { CallRecordingRecord, CallStatus, WorkflowType } from '@/types/callRecordings'

export type ReviewFilter = 'all' | 'needs_review' | 'reviewed'
export type DateFilter = 'today' | '7d' | '30d' | 'all'
export type SortOption =
  | 'newest'
  | 'oldest'
  | 'longest'
  | 'failed_first'
  | 'needs_review_first'

export const WORKFLOW_OPTIONS: WorkflowType[] = [
  'Refill Reminder',
  'Prescription Pickup',
  'Delivery Confirmation',
  'PA Follow-up',
  'Insurance Issue',
  'Medication Adherence',
]

export const STATUS_OPTIONS: Array<'all' | CallStatus> = [
  'all',
  'completed',
  'no_answer',
  'failed',
  'escalated',
]

export const REVIEW_OPTIONS: ReviewFilter[] = ['all', 'needs_review', 'reviewed']
export const DATE_OPTIONS: DateFilter[] = ['today', '7d', '30d', 'all']
export const SORT_OPTIONS: SortOption[] = [
  'newest',
  'oldest',
  'longest',
  'failed_first',
  'needs_review_first',
]

function inDateRange(iso: string, dateFilter: DateFilter): boolean {
  if (dateFilter === 'all') return true
  const now = Date.now()
  const value = new Date(iso).getTime()
  if (Number.isNaN(value)) return false

  if (dateFilter === 'today') {
    const d = new Date()
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    return value >= start
  }
  const days = dateFilter === '7d' ? 7 : 30
  return now - value <= days * 24 * 60 * 60 * 1000
}

function searchMatch(call: CallRecordingRecord, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase().trim()
  return (
    call.patientMasked.toLowerCase().includes(q) ||
    call.phoneMasked.toLowerCase().includes(q) ||
    call.workflow.toLowerCase().includes(q) ||
    call.outcome.toLowerCase().includes(q) ||
    call.summary.toLowerCase().includes(q)
  )
}

export function filterAndSortCalls(
  data: CallRecordingRecord[],
  params: {
    search: string
    status: 'all' | CallStatus
    workflow: 'all' | WorkflowType
    review: ReviewFilter
    date: DateFilter
    sort: SortOption
  },
): CallRecordingRecord[] {
  const filtered = data.filter((c) => {
    if (!searchMatch(c, params.search)) return false
    if (params.status !== 'all' && c.status !== params.status) return false
    if (params.workflow !== 'all' && c.workflow !== params.workflow) return false
    if (params.review === 'reviewed' && !c.reviewed) return false
    if (params.review === 'needs_review' && c.reviewed) return false
    if (!inDateRange(c.startedAt, params.date)) return false
    return true
  })

  const sorted = [...filtered]
  sorted.sort((a, b) => {
    if (params.sort === 'oldest') return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    if (params.sort === 'longest') return b.durationSec - a.durationSec
    if (params.sort === 'failed_first') {
      const aw = a.status === 'failed' || a.status === 'escalated' ? 1 : 0
      const bw = b.status === 'failed' || b.status === 'escalated' ? 1 : 0
      if (aw !== bw) return bw - aw
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    }
    if (params.sort === 'needs_review_first') {
      const aw = !a.reviewed ? 1 : 0
      const bw = !b.reviewed ? 1 : 0
      if (aw !== bw) return bw - aw
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    }
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  })
  return sorted
}
