export type FinalCallOutcome =
  | 'Completed'
  | 'No Answer'
  | 'Busy'
  | 'Failed'
  | 'Voicemail'
  | 'Canceled'
  | 'Needs Review'
  | 'In Progress'
  | 'Queued'

export type RetryRecommendation = {
  shouldRetry: boolean
  recommendedRetryAt: string | null
  reason: string
  nextActionLabel: string
}

type CallJobLike = {
  callStatus: string
  staffFollowUpNeeded?: boolean
  followUpReason?: string | null
  patientResponse?: string | null
  errorMessage?: string | null
  callCompletedAt?: Date | string | null
  callAttemptedAt?: Date | string | null
}

const ACTIVE_STATUSES = new Set([
  'queued',
  'queued_live',
  'dialing',
  'simulating',
  'ringing',
  'in_progress',
])

const NEEDS_REVIEW_STATUSES = new Set(['callback_requested', 'escalated', 'blocked'])

export function getFinalOutcome(job: CallJobLike): FinalCallOutcome {
  const status = job.callStatus.toLowerCase()

  if (NEEDS_REVIEW_STATUSES.has(status) || (job.staffFollowUpNeeded && !ACTIVE_STATUSES.has(status))) {
    return 'Needs Review'
  }
  if (status === 'completed' || status === 'resolved') return 'Completed'
  if (status === 'no_answer') return 'No Answer'
  if (status === 'busy') return 'Busy'
  if (status === 'failed') return 'Failed'
  if (status === 'voicemail') return 'Voicemail'
  if (status === 'cancelled' || status === 'canceled') return 'Canceled'
  if (ACTIVE_STATUSES.has(status)) return 'In Progress'
  if (status === 'invalid') return 'Needs Review'
  if (status === 'scheduled') return 'Queued'
  return 'Queued'
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000)
}

function startOfNextDay(date: Date): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return next
}

export function getRetryRecommendation(job: CallJobLike): RetryRecommendation {
  const status = job.callStatus.toLowerCase()
  const baseTime = job.callCompletedAt ?? job.callAttemptedAt ?? new Date()

  if (status === 'no_answer') {
    return {
      shouldRetry: true,
      recommendedRetryAt: addHours(new Date(baseTime), 2).toISOString(),
      reason: 'Patient did not answer the outbound call.',
      nextActionLabel: 'Retry in 2 hours',
    }
  }

  if (status === 'busy') {
    return {
      shouldRetry: true,
      recommendedRetryAt: addMinutes(new Date(baseTime), 30).toISOString(),
      reason: 'Line was busy when the call was placed.',
      nextActionLabel: 'Retry in 30 minutes',
    }
  }

  if (status === 'failed') {
    return {
      shouldRetry: false,
      recommendedRetryAt: null,
      reason: job.errorMessage ?? 'Call failed before completion.',
      nextActionLabel: 'Review phone number or call staff',
    }
  }

  if (status === 'voicemail') {
    return {
      shouldRetry: true,
      recommendedRetryAt: startOfNextDay(new Date(baseTime)).toISOString(),
      reason: 'Call reached voicemail.',
      nextActionLabel: 'Optional retry tomorrow',
    }
  }

  if (status === 'callback_requested' || status === 'escalated' || job.staffFollowUpNeeded) {
    return {
      shouldRetry: false,
      recommendedRetryAt: null,
      reason: job.followUpReason ?? 'Staff follow-up is required for this call outcome.',
      nextActionLabel: 'Create follow-up task',
    }
  }

  if (status === 'completed' || status === 'resolved') {
    return {
      shouldRetry: false,
      recommendedRetryAt: null,
      reason: 'Call completed successfully with no retry needed.',
      nextActionLabel: 'No retry needed',
    }
  }

  if (ACTIVE_STATUSES.has(status)) {
    return {
      shouldRetry: false,
      recommendedRetryAt: null,
      reason: 'Call is still in progress.',
      nextActionLabel: 'Wait for final status',
    }
  }

  return {
    shouldRetry: false,
    recommendedRetryAt: null,
    reason: 'No automatic retry recommendation for this status.',
    nextActionLabel: 'Review call details',
  }
}

export function mapCallReasonToTaskType(callReason: string, callStatus: string): string {
  const status = callStatus.toLowerCase()
  if (status === 'no_answer') return 'no_answer'
  if (status === 'failed') return 'failed_call'
  if (status === 'voicemail') return 'follow_up'
  if (status === 'callback_requested') return 'callback_request'
  if (status === 'escalated') return 'pharmacist_review'

  const reason = callReason.toLowerCase()
  if (reason.includes('insurance')) return 'insurance_issue'
  if (reason.includes('delivery')) return 'delivery_issue'
  if (reason.includes('pickup')) return 'follow_up'
  return 'follow_up'
}

export function mapCallReasonToWorkflow(callReason: string): string {
  const map: Record<string, string> = {
    refill_reminder: 'Refill Reminder',
    pickup_reminder: 'Prescription Pickup',
    delivery_update: 'Delivery Confirmation',
    insurance_update: 'Insurance Issue',
    general_callback: 'Refill Reminder',
  }
  return map[callReason] ?? 'Refill Reminder'
}
