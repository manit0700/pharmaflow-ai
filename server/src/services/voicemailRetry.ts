import { prisma } from '../lib/prisma.js'

export const VOICEMAIL_RETRY_HOURS = 4
export const NO_ANSWER_RETRY_HOURS = 2
export const BUSY_RETRY_HOURS = 1

type RetryReason = 'voicemail' | 'no_answer' | 'busy'

const RETRY_HOURS: Record<RetryReason, number> = {
  voicemail: VOICEMAIL_RETRY_HOURS,
  no_answer: NO_ANSWER_RETRY_HOURS,
  busy: BUSY_RETRY_HOURS,
}

export function computeRetryTime(reason: RetryReason, now = new Date()): Date | null {
  const retryAt = new Date(now)
  retryAt.setHours(retryAt.getHours() + RETRY_HOURS[reason], 0, 0, 0)
  const cap = new Date(now)
  cap.setHours(18, 0, 0, 0)
  if (now >= cap) return null
  return retryAt > cap ? cap : retryAt
}

export async function scheduleOutcomeRetry(callJobId: string, reason: RetryReason): Promise<void> {
  const job = await prisma.callJob.findUnique({
    where: { id: callJobId },
    select: { patientName: true, retryStatus: true, retryAttempt: true },
  }).catch(() => null)
  if (!job || job.retryStatus === 'scheduled' || job.retryAttempt >= 3) return

  const scheduledFor = computeRetryTime(reason)
  if (!scheduledFor) return

  const updated = await prisma.callJob.updateMany({
    where: { id: callJobId, retryStatus: { not: 'scheduled' }, retryAttempt: { lt: 3 } },
    data: {
      retryStatus: 'scheduled',
      retryAttempt: { increment: 1 },
      scheduledFor,
      retryReason: `Auto retry after ${reason.replace(/_/g, ' ')}`,
    },
  }).catch(() => ({ count: 0 }))

  if (updated.count === 1) {
    console.log(`[voicemail-retry] Scheduled retry for ${job.patientName} at ${scheduledFor.toLocaleString('en-US', { timeZone: 'America/Chicago' })}`)
  }
}
