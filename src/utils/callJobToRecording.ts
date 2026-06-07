import type { CallRecordingRecord, CallStatus, WorkflowType } from '@/types/callRecordings'
import type { CallJob } from '@/utils/api'
import { getFinalOutcome, getRetryRecommendation } from '@/utils/callOutcome'
import { maskPatientName, maskPhone } from '@/utils/staffTaskMapper'

const REASON_TO_WORKFLOW: Record<string, WorkflowType> = {
  refill_reminder: 'Refill Reminder',
  pickup_reminder: 'Prescription Pickup',
  delivery_update: 'Delivery Confirmation',
  insurance_update: 'Insurance Issue',
  general_callback: 'Refill Reminder',
}

function mapRecordingStatus(callStatus: string): CallStatus {
  const status = callStatus.toLowerCase()
  if (status === 'completed' || status === 'resolved') return 'completed'
  if (status === 'no_answer') return 'no_answer'
  if (status === 'failed') return 'failed'
  if (status === 'escalated' || status === 'callback_requested') return 'escalated'
  if (status === 'busy') return 'busy'
  if (status === 'voicemail') return 'voicemail'
  if (status === 'cancelled' || status === 'canceled') return 'canceled'
  return 'failed'
}

function parseTranscript(json: string | null | undefined) {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as Array<{
      mode?: string
      step?: string
      input?: string
      result?: string
      summary?: string
      at?: string
    }>
    if (!Array.isArray(parsed)) return []
    return parsed.slice(-12).map((entry, index) => ({
      speaker: entry.mode === 'ai' ? ('ai' as const) : entry.mode === 'dtmf' ? ('patient' as const) : ('staff' as const),
      text: entry.summary ?? entry.result ?? entry.input ?? entry.step ?? 'Call event',
      time: entry.at ? new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `Step ${index + 1}`,
    }))
  } catch {
    return []
  }
}

function sentimentFromOutcome(outcome: string): 'Positive' | 'Neutral' | 'Negative' {
  if (outcome === 'Completed') return 'Positive'
  if (outcome === 'Needs Review') return 'Negative'
  if (outcome === 'Failed' || outcome === 'Canceled') return 'Negative'
  return 'Neutral'
}

export function callJobToRecording(job: CallJob): CallRecordingRecord {
  const outcome = getFinalOutcome(job)
  const retry = getRetryRecommendation(job)
  const startedAt = job.callAttemptedAt ?? job.createdAt
  const openTask = job.staffTasks?.find((task) => task.status !== 'completed')

  return {
    id: job.id,
    patientName: job.patientName,
    patientMasked: maskPatientName(job.patientName),
    phoneMasked: maskPhone(job.phoneNumber),
    workflow: REASON_TO_WORKFLOW[job.callReason] ?? 'Refill Reminder',
    status: mapRecordingStatus(job.callStatus),
    startedAt,
    durationSec: job.callDuration ?? 0,
    aiConfidence: job.aiConfidence ?? (job.callStatus === 'completed' ? 88 : 72),
    sentiment: sentimentFromOutcome(outcome),
    followUpNeeded: Boolean(job.staffFollowUpNeeded || openTask),
    reviewed: job.callStatus === 'resolved' || job.resolutionStatus === 'resolved',
    outcome,
    summary: job.aiSummary ?? job.patientResponse ?? job.followUpReason ?? retry.reason,
    recommendation: retry.nextActionLabel,
    keyTags: [
      job.callStatus.replace(/_/g, ' '),
      outcome,
      ...(retry.shouldRetry ? ['retry recommended'] : []),
    ],
    transcript: parseTranscript(job.transcriptJson),
    relatedFollowUpTaskId: openTask?.id,
    liveSource: 'api',
    twilioCallSid: job.twilioCallSid,
    twilioStatus: job.callStatus,
    finalOutcome: outcome,
    retryRecommendation: retry,
    errorMessage: job.errorMessage,
  }
}

export function mergeRecordingSources(
  liveJobs: CallJob[],
  mockRecords: CallRecordingRecord[],
): CallRecordingRecord[] {
  const live = liveJobs.map(callJobToRecording)
  const liveIds = new Set(live.map((record) => record.id))
  const mockOnly = mockRecords.filter((record) => !liveIds.has(record.id))
  return [...live, ...mockOnly].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )
}
