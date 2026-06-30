/** Call statuses where an outbound dial is already in flight */
export const ACTIVE_CALL_STATUSES = new Set([
  'dialing',
  'simulating',
  'ringing',
  'in_progress',
  'queued_live',
])

/** Final/resolved statuses — no further action needed or possible */
export const TERMINAL_CALL_STATUSES = new Set([
  'completed',
  'voicemail',
  'needs_review',
  'escalated',
  'callback_requested',
  'no_answer',
  'busy',
  'failed',
  'canceled',
])

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  queued_live: 'Calling',
  dialing: 'Calling',
  ringing: 'Calling',
  simulating: 'Calling',
  queued: 'Queued',
  scheduled: 'Scheduled',
  voicemail: 'Voicemail / Auto System',
  needs_review: 'Needs Review',
  failed: 'Failed',
  no_answer: 'No Answer',
  busy: 'Busy',
  callback_requested: 'Callback Requested',
  escalated: 'Staff Review',
  canceled: 'Canceled',
  cancelled: 'Canceled',
  blocked: 'Blocked',
}

export function callStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

export function isActiveCallStatus(status: string): boolean {
  return ACTIVE_CALL_STATUSES.has(status)
}

export function isCallInProgress(status: string): boolean {
  return ACTIVE_CALL_STATUSES.has(status)
}

export function canStartCall(status: string): boolean {
  return !isCallInProgress(status) && !TERMINAL_CALL_STATUSES.has(status)
}
