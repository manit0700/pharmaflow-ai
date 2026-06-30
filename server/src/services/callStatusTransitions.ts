export type TransitionSource =
  | 'twilio_callback'
  | 'manual_update'
  | 'ai_turn'
  | 'retry_scheduler'
  | 'start_call'

export interface TransitionResult {
  allowed: boolean
  reason?: string
}

const FINAL_STATUSES = new Set([
  'completed',
  'escalated',
  'callback_requested',
  'voicemail',
  'no_answer',
  'busy',
  'failed',
  'canceled',
])

const ACTIVE_STATUSES = new Set([
  'queued',
  'queued_live',
  'dialing',
  'ringing',
  'in_progress',
  'scheduled',
])

// Twilio sends a plain "completed" when the call ends. These AI-driven review
// states must not be overwritten by that late signal.
const REVIEW_PROTECTED = new Set(['escalated', 'callback_requested', 'voicemail'])

// Statuses from which a retry/start is permitted.
const RETRYABLE_STATUSES = new Set(['queued', 'scheduled', 'failed', 'no_answer', 'busy', 'canceled', 'voicemail'])

export function canTransitionCallStatus(
  currentStatus: string,
  nextStatus: string,
  source: TransitionSource,
): TransitionResult {
  if (currentStatus === nextStatus) return { allowed: true }

  switch (source) {
    case 'start_call': {
      if (!RETRYABLE_STATUSES.has(currentStatus)) {
        return {
          allowed: false,
          reason: `start_call blocked: cannot initiate from '${currentStatus}'`,
        }
      }
      return { allowed: true }
    }

    case 'twilio_callback': {
      // Prevent Twilio from resurrecting a finished call back to an active state
      if (FINAL_STATUSES.has(currentStatus) && ACTIVE_STATUSES.has(nextStatus)) {
        return {
          allowed: false,
          reason: `twilio_callback blocked: '${currentStatus}' → '${nextStatus}' (active revert after final)`,
        }
      }
      // Prevent Twilio's generic "completed" from overwriting a more specific final result.
      if (FINAL_STATUSES.has(currentStatus) && currentStatus !== 'completed' && nextStatus === 'completed') {
        return {
          allowed: false,
          reason: `twilio_callback blocked: '${currentStatus}' is final — 'completed' must not overwrite it`,
        }
      }
      // Keep this explicit for readability; it is covered by the generic final guard above.
      if (REVIEW_PROTECTED.has(currentStatus) && nextStatus === 'completed') {
        return {
          allowed: false,
          reason: `twilio_callback blocked: '${currentStatus}' is review-protected — 'completed' must not overwrite it`,
        }
      }
      return { allowed: true }
    }

    case 'ai_turn': {
      // AI should only act on active calls; the stale-webhook guard already catches
      // most cases, but this ensures status mutations are also protected.
      if (FINAL_STATUSES.has(currentStatus)) {
        return {
          allowed: false,
          reason: `ai_turn blocked: call is already in final status '${currentStatus}'`,
        }
      }
      return { allowed: true }
    }

    case 'retry_scheduler': {
      if (!RETRYABLE_STATUSES.has(currentStatus)) {
        return {
          allowed: false,
          reason: `retry_scheduler blocked: '${currentStatus}' is not retryable`,
        }
      }
      if (!ACTIVE_STATUSES.has(nextStatus) && nextStatus !== 'queued' && nextStatus !== 'scheduled') {
        return {
          allowed: false,
          reason: `retry_scheduler blocked: cannot set status to '${nextStatus}'`,
        }
      }
      return { allowed: true }
    }

    case 'manual_update': {
      // Staff always wins. No blocking — just flow through.
      return { allowed: true }
    }

    default:
      return { allowed: true }
  }
}
