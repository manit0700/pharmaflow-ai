import type { CallRecording, Conversation, TranscriptSegment } from '@/types'

export function generateWaveformPeaks(count = 80, seed = 0): number[] {
  const peaks: number[] = []
  for (let i = 0; i < count; i++) {
    const t = Math.sin((i + seed) * 0.4) * 0.35 + Math.random() * 0.45
    peaks.push(Math.max(0.08, Math.min(1, t)))
  }
  return peaks
}

export function buildRecording(
  conversationId: string,
  patientFirstName: string,
  durationSec: number,
  recordedAt: string,
): CallRecording {
  const safe = patientFirstName.toLowerCase().replace(/\s+/g, '-')
  return {
    id: `rec-${conversationId}`,
    fileName: `outbound-${safe}-${recordedAt.slice(0, 10)}.wav`,
    durationSec: Math.max(durationSec, 8),
    recordedAt,
    waveformPeaks: generateWaveformPeaks(96, patientFirstName.length),
    consentCaptured: true,
    retentionDays: 90,
    channelLabel: 'Outbound voice (Twilio mock)',
  }
}

export function buildRecordingFromTranscript(
  id: string,
  patientFirstName: string,
  workflowName: string,
  requestType: Conversation['requestType'],
  resolutionStatus: Conversation['resolutionStatus'],
  transcript: TranscriptSegment[],
  messages: Conversation['messages'],
  startedAt: string,
  escalationReason?: string,
): Conversation {
  const durationSec =
    transcript.length > 0
      ? Math.max(...transcript.map((t) => t.startSec + 12), 45)
      : 22
  const recording = buildRecording(id, patientFirstName, durationSec, startedAt)
  return {
    id,
    patientFirstName,
    channel: 'voice',
    requestType,
    resolutionStatus,
    escalationReason,
    durationSec,
    startedAt,
    workflowName,
    aiConfidence: 0.85 + Math.random() * 0.1,
    extractedData: { direction: 'outbound', recordingId: recording.id },
    messages,
    transcript,
    recording,
  }
}
