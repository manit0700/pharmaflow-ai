/** Call statuses where an outbound dial is already in flight */
export const ACTIVE_CALL_STATUSES = new Set([
  'dialing',
  'simulating',
  'ringing',
  'in_progress',
  'queued_live',
])

export function isActiveCallStatus(status: string): boolean {
  return ACTIVE_CALL_STATUSES.has(status)
}

export function isCallInProgress(status: string): boolean {
  return ACTIVE_CALL_STATUSES.has(status)
}

export function canStartCall(status: string): boolean {
  return !isCallInProgress(status) && !['completed', 'resolved', 'blocked', 'cancelled'].includes(status)
}
