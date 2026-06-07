export type CallStatus =
  | 'completed'
  | 'no_answer'
  | 'failed'
  | 'escalated'
  | 'busy'
  | 'voicemail'
  | 'canceled'

export type OutcomeFilter =
  | 'all'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'voicemail'
  | 'retry_recommended'

export type WorkflowType =
  | 'Refill Reminder'
  | 'Prescription Pickup'
  | 'Delivery Confirmation'
  | 'PA Follow-up'
  | 'Insurance Issue'
  | 'Medication Adherence'

export type Sentiment = 'Positive' | 'Neutral' | 'Negative'

export type FollowUpAction =
  | 'mark_reviewed'
  | 'assign_pharmacist'
  | 'call_back_later'
  | 'create_pa_task'
  | 'mark_resolved'
  | null

export interface TranscriptLine {
  speaker: 'ai' | 'patient' | 'staff'
  text: string
  time: string
}

export interface CallRecordingRecord {
  id: string
  patientName: string
  patientMasked: string
  phoneMasked: string
  workflow: WorkflowType
  status: CallStatus
  startedAt: string
  durationSec: number
  aiConfidence: number
  sentiment: Sentiment
  followUpNeeded: boolean
  reviewed: boolean
  outcome: string
  summary: string
  recommendation: string
  keyTags: string[]
  transcript: TranscriptLine[]
  relatedFollowUpTaskId?: string
  liveSource?: 'api' | 'mock'
  twilioCallSid?: string | null
  twilioStatus?: string | null
  finalOutcome?: string
  retryRecommendation?: {
    shouldRetry: boolean
    recommendedRetryAt: string | null
    reason: string
    nextActionLabel: string
  }
  errorMessage?: string | null
}
