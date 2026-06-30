import type { CallJob } from '@/utils/api'
import type { Conversation, ConversationMessage, RequestType, ResolutionStatus, TranscriptSegment } from '@/types'
import { generateWaveformPeaks } from '@/utils/recording'

type ChatMessage = { role: string; content: string }
type TranscriptEntry = {
  speaker?: 'ai' | 'patient' | 'pharmacy_staff' | 'system'
  text?: string
  input?: string
  result?: string
  summary?: string
  step?: string
  timestamp?: string
  at?: string
}

function parseMessages(json: string | null): ChatMessage[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as ChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseTranscript(json: string | null): TranscriptEntry[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as TranscriptEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mapCallReason(reason: string): RequestType {
  if (reason.includes('refill')) return 'refill'
  if (reason.includes('pickup') || reason.includes('delivery')) return 'prescription_status'
  if (reason.includes('insurance')) return 'prior_auth'
  if (reason.includes('callback')) return 'missed_call'
  return 'other'
}

function mapResolution(job: CallJob): ResolutionStatus {
  // voicemail and needs_review are auto-closed — show as pending, not escalated
  if (job.callStatus === 'voicemail' || job.callStatus === 'needs_review') return 'pending'
  if (job.staffFollowUpNeeded || job.callStatus === 'escalated' || job.callStatus === 'callback_requested') return 'escalated'
  if (job.patientResponse || job.callStatus === 'completed') return 'resolved'
  if (job.callStatus === 'no_answer') return 'pending'
  return 'pending'
}

function roleToConversationRole(role: string): ConversationMessage['role'] {
  if (role === 'user') return 'patient'
  if (role === 'assistant') return 'ai'
  if (role === 'staff') return 'staff'
  return 'ai'
}

function transcriptRoleToConversationRole(role: TranscriptEntry['speaker']): ConversationMessage['role'] {
  if (role === 'patient') return 'patient'
  if (role === 'pharmacy_staff') return 'staff'
  return 'ai'
}

export function callJobToConversation(job: CallJob): Conversation {
  const rawTranscript = parseTranscript(job.transcriptJson).filter((entry) => entry.speaker !== 'system')
  const rawMessages = parseMessages(job.messagesJson)
  const startedAt = job.callAttemptedAt ?? job.callCompletedAt ?? job.createdAt

  // Derive call intelligence from stored history
  const aiTurns = rawMessages.filter((m) => m.role === 'assistant').length
  const dobVerifiedInHistory = rawMessages.some((m) => m.role === 'system' && m.content === '__DOB_VERIFIED__')
  const dobVerified = dobVerifiedInHistory || (job.patientResponse !== null && job.patientResponse !== 'DOB verification failed')

  // Parse prescriptions if multiple
  let prescriptionsDisplay = ''
  if (job.prescriptionsJson) {
    try {
      const rxs = JSON.parse(job.prescriptionsJson) as Array<{ name: string; cost?: number }>
      if (Array.isArray(rxs) && rxs.length > 1) {
        prescriptionsDisplay = rxs.map((rx) => rx.name + (rx.cost ? ` ($${rx.cost.toFixed(2)})` : '')).join(' · ')
      }
    } catch { /* ignore */ }
  }
  const durationSec = job.callDuration ?? 0
  const firstName = job.patientName.trim().split(/\s+/)[0] ?? job.patientName

  const messages: ConversationMessage[] =
    rawTranscript.length > 0
      ? rawTranscript.map((entry, i) => ({
          id: `${job.id}-turn-${i}`,
          role: transcriptRoleToConversationRole(entry.speaker),
          content: entry.text ?? entry.summary ?? entry.result ?? entry.input ?? entry.step ?? 'Call event',
          timestamp: entry.timestamp ?? entry.at ?? startedAt,
        }))
      : rawMessages
          .filter((m) => m.role !== 'system')
          .map((m, i) => ({
            id: `${job.id}-msg-${i}`,
            role: roleToConversationRole(m.role),
            content: m.content,
            timestamp: startedAt,
          }))

  if (messages.length === 0 && job.patientResponse) {
    messages.push({
      id: `${job.id}-response`,
      role: 'patient',
      content: job.patientResponse,
      timestamp: job.callCompletedAt ?? startedAt,
    })
  }

  if (messages.length === 0 && job.aiSummary) {
    messages.push({
      id: `${job.id}-summary`,
      role: 'ai',
      content: job.aiSummary,
      timestamp: startedAt,
    })
  }

  const transcript: TranscriptSegment[] = messages.map((m, i) => ({
    speaker: m.role,
    text: m.content,
    startSec: Math.min(i * 8, Math.max(durationSec - 12, 0)),
  }))

  const safeName = firstName.toLowerCase().replace(/\s+/g, '-')

  return {
    id: job.id,
    patientFirstName: firstName,
    channel: 'voice',
    requestType: mapCallReason(job.callReason),
    aiConfidence: job.aiConfidence ?? (job.patientResponse ? 0.9 : 0.75),
    resolutionStatus: mapResolution(job),
    escalationReason: job.followUpReason ?? undefined,
    durationSec: Math.max(durationSec, messages.length > 0 ? 15 : 0),
    startedAt,
    workflowName: job.callReason.replace(/_/g, ' '),
    extractedData: {
      medication: prescriptionsDisplay || job.medicationName,
      ...(prescriptionsDisplay ? { prescriptions: prescriptionsDisplay } : {}),
      patientResponse: job.patientResponse ?? '',
      phone: job.phoneNumber,
      callStatus: job.callStatus,
      dobVerified: dobVerified ? 'Verified' : 'Not verified',
      aiTurns: aiTurns > 0 ? String(aiTurns) : '—',
    },
    messages,
    transcript,
    recording: {
      id: job.recordingSid ?? job.twilioCallSid ?? `rec-${job.id}`,
      fileName: `outbound-${safeName}-${startedAt.slice(0, 10)}.call`,
      // Use actual recording duration when available; fall back to estimated call duration
      durationSec: job.recordingDuration ?? Math.max(durationSec, 8),
      realDurationSec: job.recordingDuration ?? undefined,
      recordedAt: job.callCompletedAt ?? startedAt,
      waveformPeaks: generateWaveformPeaks(96, firstName.length),
      consentCaptured: true,
      retentionDays: 90,
      channelLabel: 'Outbound voice (Twilio)',
      ...(job.recordingUrl ? { audioProxyUrl: `/api/call-jobs/${job.id}/recording/audio` } : {}),
      ...(job.recordingSid ? { recordingSid: job.recordingSid } : {}),
    },
  }
}

export function isAttemptedCall(job: CallJob): boolean {
  return Boolean(
    job.callAttemptedAt ||
      job.callCompletedAt ||
      job.twilioCallSid ||
      ['completed', 'escalated', 'callback_requested', 'voicemail', 'no_answer', 'failed', 'in_progress', 'dialing', 'needs_review'].includes(
        job.callStatus,
      ),
  )
}
