import type { CallJob } from '@/utils/api'

export interface LiveFeedItem {
  id: string
  at: string
  speaker: 'patient' | 'pharmacy' | 'system'
  text: string
  step?: string
}

type TranscriptEntry = {
  at: string
  mode: 'dtmf' | 'ai' | 'system'
  step: string
  input?: string
  result?: string
  action?: string
  summary?: string
}

function parseTranscriptJson(json: string | null): TranscriptEntry[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? (parsed as TranscriptEntry[]) : []
  } catch {
    return []
  }
}

function dtmfInputLabel(step: string, input: string, result?: string): string {
  if (step === 'dob') {
    const digits = input && /[\d*]/.test(input) ? ` (${input})` : ''
    if (result === 'DOB verified') return `Entered DOB${digits} — verified ✓`
    if (result === 'DOB retry') return `Entered DOB${digits} — mismatch, retrying`
    if (result === 'DOB verification failed') return `Entered DOB${digits} — verification failed`
    return `Entered date of birth${digits}`
  }
  if (step === 'menu') {
    return `Pressed ${input}${result ? ` — "${result}"` : ''}`
  }
  return input
}

function transcriptToFeed(entries: TranscriptEntry[]): LiveFeedItem[] {
  const items: LiveFeedItem[] = []
  for (const [i, e] of entries.entries()) {
    if (e.mode === 'system' && e.step === 'twilio_status') {
      items.push({
        id: `sys-${i}`,
        at: e.at,
        speaker: 'system',
        text: `Call status: ${e.result ?? e.input ?? 'update'}`,
        step: e.step,
      })
      continue
    }

    if (e.input && e.mode !== 'system') {
      items.push({
        id: `in-${i}`,
        at: e.at,
        speaker: 'patient',
        text: e.mode === 'ai' ? e.input : dtmfInputLabel(e.step, e.input, e.result),
        step: e.step,
      })
    }

    if (e.result) {
      items.push({
        id: `out-${i}`,
        at: e.at,
        speaker: 'pharmacy',
        text: e.summary ?? e.result,
        step: e.step,
      })
    } else if (e.summary) {
      items.push({
        id: `sum-${i}`,
        at: e.at,
        speaker: 'pharmacy',
        text: e.summary,
        step: e.step,
      })
    }
  }
  return items
}

function messagesToFeed(json: string | null, startedAt: string): LiveFeedItem[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as { role: string; content: string }[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((m) => m.role !== 'system')
      .map((m, i) => ({
        id: `msg-${i}`,
        at: startedAt,
        speaker: m.role === 'user' ? ('patient' as const) : ('pharmacy' as const),
        text: m.content,
        step: 'ai_conversation',
      }))
  } catch {
    return []
  }
}

/** Merge transcript + AI messages into one chronological feed for the UI */
export function buildLiveFeed(job: CallJob): LiveFeedItem[] {
  const fromTranscript = transcriptToFeed(parseTranscriptJson(job.transcriptJson))
  const fromMessages = messagesToFeed(job.messagesJson, job.callAttemptedAt ?? job.createdAt)

  if (fromMessages.length > 0 && fromTranscript.some((e) => e.step === 'speech_turn')) {
    return fromTranscript
  }
  if (fromMessages.length > fromTranscript.length) {
    return fromMessages
  }
  return fromTranscript
}

export function latestPatientReply(job: CallJob): string | null {
  const feed = buildLiveFeed(job)
  for (let i = feed.length - 1; i >= 0; i--) {
    if (feed[i].speaker === 'patient') return feed[i].text
  }
  return job.patientResponse
}
