import type { CallJob } from '@/utils/api'
import type { Conversation, ConversationMessage, RequestType, ResolutionStatus, TranscriptSegment } from '@/types'
import { generateWaveformPeaks } from '@/utils/recording'

type ChatMessage = { role: string; content: string }

function parseMessages(json: string | null): ChatMessage[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as ChatMessage[]
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
  if (job.staffFollowUpNeeded || job.callStatus === 'escalated') return 'escalated'
  if (job.patientResponse || job.callStatus === 'completed') return 'resolved'
  if (job.callStatus === 'voicemail' || job.callStatus === 'no_answer') return 'pending'
  return 'pending'
}

function roleToConversationRole(role: string): ConversationMessage['role'] {
  if (role === 'user') return 'patient'
  if (role === 'assistant') return 'ai'
  if (role === 'staff') return 'staff'
  return 'ai'
}

export function callJobToConversation(job: CallJob): Conversation {
  const rawMessages = parseMessages(job.messagesJson)
  const startedAt = job.callAttemptedAt ?? job.callCompletedAt ?? job.createdAt
  const durationSec = job.callDuration ?? 0
  const firstName = job.patientName.trim().split(/\s+/)[0] ?? job.patientName

  const messages: ConversationMessage[] = rawMessages
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
      medication: job.medicationName,
      patientResponse: job.patientResponse ?? '',
      phone: job.phoneNumber,
      callStatus: job.callStatus,
    },
    messages,
    transcript,
    recording: {
      id: job.twilioCallSid ?? `rec-${job.id}`,
      fileName: `outbound-${safeName}-${startedAt.slice(0, 10)}.call`,
      durationSec: Math.max(durationSec, 8),
      recordedAt: job.callCompletedAt ?? startedAt,
      waveformPeaks: generateWaveformPeaks(96, firstName.length),
      consentCaptured: true,
      retentionDays: 90,
      channelLabel: 'Outbound voice (Twilio)',
    },
  }
}

export function isAttemptedCall(job: CallJob): boolean {
  return Boolean(
    job.callAttemptedAt ||
      job.callCompletedAt ||
      job.twilioCallSid ||
      ['completed', 'escalated', 'voicemail', 'no_answer', 'failed', 'in_progress', 'dialing'].includes(
        job.callStatus,
      ),
  )
}
