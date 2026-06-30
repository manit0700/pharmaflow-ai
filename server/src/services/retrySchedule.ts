import type { CallJob } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import {
  getFinalOutcome,
  getRetryRecommendation,
  mapCallReasonToTaskType,
  mapCallReasonToWorkflow,
  type RetryRecommendation,
} from './callOutcome.js'
import { startCallJobById } from './callExecution.js'
import { phoneProvider } from './phoneProvider.js'

export const ACTIVE_RETRY_STATUSES = ['scheduled', 'in_progress', 'recommended'] as const

export type RetryScheduleInput = {
  scheduledFor?: string | null
  reason?: string | null
  placeImmediately?: boolean
  createFollowUpTask?: boolean
}

export type RetryHistoryEntry = {
  id: string
  retryAttempt: number
  scheduledFor: string | null
  retryStatus: string
  callStatus: string
  finalOutcome: string
  createdAt: string
  relatedTaskId: string | null
}

function rootCallJobId(job: Pick<CallJob, 'id' | 'parentCallJobId'>): string {
  return job.parentCallJobId ?? job.id
}

export function parseScheduledFor(value: string | null | undefined, fallback: string | null): Date | null {
  if (value) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (fallback) {
    const parsed = new Date(fallback)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

export async function findActiveRetryForOriginal(original: Pick<CallJob, 'id' | 'parentCallJobId'>) {
  const rootId = rootCallJobId(original)
  return prisma.callJob.findFirst({
    where: {
      parentCallJobId: rootId,
      retryStatus: { in: [...ACTIVE_RETRY_STATUSES] },
      callStatus: { notIn: ['completed', 'resolved', 'cancelled', 'failed'] },
      id: { not: original.id },
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function countRetryAttempts(rootId: string): Promise<number> {
  return prisma.callJob.count({
    where: {
      OR: [{ parentCallJobId: rootId }, { retryOfCallJobId: rootId }],
      retryAttempt: { gt: 0 },
    },
  })
}

export async function loadRetryHistory(job: Pick<CallJob, 'id' | 'parentCallJobId'>): Promise<RetryHistoryEntry[]> {
  const rootId = rootCallJobId(job)
  const related = await prisma.callJob.findMany({
    where: {
      OR: [{ id: rootId }, { parentCallJobId: rootId }, { retryOfCallJobId: rootId }, { id: job.id }],
    },
    orderBy: { createdAt: 'asc' },
  })

  return related.map((entry) => ({
    id: entry.id,
    retryAttempt: entry.retryAttempt,
    scheduledFor: entry.scheduledFor?.toISOString() ?? null,
    retryStatus: entry.retryStatus,
    callStatus: entry.callStatus,
    finalOutcome: getFinalOutcome(entry),
    createdAt: entry.createdAt.toISOString(),
    relatedTaskId: entry.relatedTaskId,
  }))
}

export async function buildRetryEnrichment(jobs: CallJob[]) {
  if (jobs.length === 0) {
    return new Map<string, {
      hasActiveRetry: boolean
      activeRetryCallJobId: string | null
      scheduledRetryAt: string | null
      retryHistory: RetryHistoryEntry[]
    }>()
  }

  const rootIds = [...new Set(jobs.map((job) => rootCallJobId(job)))]
  const [activeRetries, relatedJobs] = await Promise.all([
    prisma.callJob.findMany({
      where: {
        parentCallJobId: { in: rootIds },
        retryStatus: { in: [...ACTIVE_RETRY_STATUSES] },
        callStatus: { notIn: ['completed', 'resolved', 'cancelled', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.callJob.findMany({
      where: {
        OR: [{ id: { in: rootIds } }, { parentCallJobId: { in: rootIds } }],
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const activeByRoot = new Map<string, (typeof activeRetries)[number]>()
  for (const retry of activeRetries) {
    const root = retry.parentCallJobId
    if (root && !activeByRoot.has(root)) activeByRoot.set(root, retry)
  }

  const historyByRoot = new Map<string, RetryHistoryEntry[]>()
  for (const rootId of rootIds) {
    const chain = relatedJobs.filter(
      (entry) => entry.id === rootId || entry.parentCallJobId === rootId || entry.retryOfCallJobId === rootId,
    )
    historyByRoot.set(
      rootId,
      chain.map((entry) => ({
        id: entry.id,
        retryAttempt: entry.retryAttempt,
        scheduledFor: entry.scheduledFor?.toISOString() ?? null,
        retryStatus: entry.retryStatus,
        callStatus: entry.callStatus,
        finalOutcome: getFinalOutcome(entry),
        createdAt: entry.createdAt.toISOString(),
        relatedTaskId: entry.relatedTaskId,
      })),
    )
  }

  const enrichment = new Map<
    string,
    {
      hasActiveRetry: boolean
      activeRetryCallJobId: string | null
      scheduledRetryAt: string | null
      retryHistory: RetryHistoryEntry[]
    }
  >()

  for (const job of jobs) {
    const rootId = rootCallJobId(job)
    const active = activeByRoot.get(rootId) ?? null
    enrichment.set(job.id, {
      hasActiveRetry: Boolean(active),
      activeRetryCallJobId: active?.id ?? null,
      scheduledRetryAt: active?.scheduledFor?.toISOString() ?? null,
      retryHistory: historyByRoot.get(rootId) ?? [],
    })
  }

  return enrichment
}

async function createFollowUpTaskForCall(
  job: CallJob,
  retry: RetryRecommendation,
  outcome: string,
  extraMessage?: string,
) {
  const existing = await prisma.staffTask.findFirst({
    where: {
      callJobId: { in: [job.id, job.retryOfCallJobId ?? job.id, job.parentCallJobId ?? job.id].filter(Boolean) as string[] },
      status: { notIn: ['completed', 'cancelled'] },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return existing

  const task = await prisma.staffTask.create({
    data: {
      callJobId: job.id,
      patientName: job.patientName,
      phoneNumber: job.phoneNumber,
      medicationName: job.medicationName,
      taskType: mapCallReasonToTaskType(job.callReason, job.callStatus),
      priority: job.callStatus === 'escalated' || job.callStatus === 'failed' ? 'high' : 'normal',
      status: 'open',
      notes: job.followUpReason ?? retry.reason,
      aiSummary: job.aiSummary,
      assignedTeam: 'Unassigned',
      dueDate: new Date().toISOString().slice(0, 10),
      dueTime: '15:00',
      sourceWorkflow: mapCallReasonToWorkflow(job.callReason),
      issueSummary: extraMessage ?? job.followUpReason ?? `${outcome}: ${retry.reason}`,
      activityJson: JSON.stringify([
        {
          id: `act-${Date.now()}`,
          type: 'created',
          message: extraMessage ?? `Follow-up task created from call outcome (${outcome}).`,
          timestamp: new Date().toISOString(),
          actor: 'System',
        },
      ]),
    },
  })

  await prisma.auditEvent
    .create({
      data: {
        entityType: 'staff_task',
        entityId: task.id,
        action: 'TASK_CREATED_FROM_CALL',
        actor: 'workflow-engine',
        message: `Follow-up task created from call job ${job.id}.`,
        metadataJson: JSON.stringify({ callJobId: job.id, outcome, callStatus: job.callStatus }),
      },
    })
    .catch(() => null)

  return task
}

export async function scheduleRetryCallJob(originalId: string, input: RetryScheduleInput = {}) {
  const original = await prisma.callJob.findUnique({ where: { id: originalId } })
  if (!original) throw new Error('Call job not found')

  const retryRecommendation = getRetryRecommendation(original)
  const finalOutcome = getFinalOutcome(original)

  if (!retryRecommendation.shouldRetry && !input.createFollowUpTask) {
    throw new Error(retryRecommendation.reason || 'Retry is not recommended for this call outcome.')
  }

  if (!retryRecommendation.shouldRetry && input.createFollowUpTask) {
    const task = await createFollowUpTaskForCall(original, retryRecommendation, finalOutcome)
    return {
      ok: true as const,
      existing: false as const,
      originalCallJob: original,
      retryCallJob: null,
      retryRecommendation,
      followUpTask: task,
    }
  }

  const existing = await findActiveRetryForOriginal(original)
  if (existing) {
    return {
      ok: true as const,
      existing: true as const,
      originalCallJob: original,
      retryCallJob: existing,
      retryRecommendation,
    }
  }

  const rootId = rootCallJobId(original)
  const priorAttempts = await countRetryAttempts(rootId)
  const nextAttempt = priorAttempts + 1
  const maxAttempts = original.maxRetryAttempts || 3

  if (nextAttempt > maxAttempts) {
    throw new Error(`Maximum retry attempts (${maxAttempts}) reached for this call chain.`)
  }

  const scheduledFor = parseScheduledFor(
    input.scheduledFor,
    input.placeImmediately ? new Date().toISOString() : retryRecommendation.recommendedRetryAt,
  )

  const retryReason = input.reason?.trim() || retryRecommendation.reason
  const notesSuffix = `[Retry attempt ${nextAttempt} scheduled${scheduledFor ? ` for ${scheduledFor.toISOString()}` : ''}]`

  const retryCallJob = await prisma.callJob.create({
    data: {
      patientName: original.patientName,
      phoneNumber: original.phoneNumber,
      dob: original.dob,
      medicationName: original.medicationName,
      callReason: original.callReason,
      notes: original.notes ? `${original.notes}\n${notesSuffix}` : notesSuffix,
      validationStatus: original.validationStatus === 'invalid' ? 'valid' : original.validationStatus,
      validationError: null,
      callStatus: input.placeImmediately ? 'queued' : 'scheduled',
      retryOfCallJobId: original.id,
      parentCallJobId: rootId,
      retryAttempt: nextAttempt,
      maxRetryAttempts: maxAttempts,
      scheduledFor,
      retryReason,
      retryStatus: input.placeImmediately ? 'in_progress' : 'scheduled',
      createdFromOutcome: finalOutcome,
      staffFollowUpNeeded: original.staffFollowUpNeeded,
      followUpReason: original.followUpReason,
    },
  })

  await prisma.auditEvent
    .create({
      data: {
        entityType: 'call_job',
        entityId: retryCallJob.id,
        action: 'retry_scheduled',
        actor: 'workflow-engine',
        message: 'Retry scheduled from original call outcome.',
        metadataJson: JSON.stringify({
          originalCallJobId: original.id,
          retryAttempt: nextAttempt,
          scheduledFor: scheduledFor?.toISOString() ?? null,
          createdFromOutcome: finalOutcome,
        }),
      },
    })
    .catch(() => null)

  await prisma.callEvent
    .create({
      data: {
        callJobId: original.id,
        twilioCallSid: original.twilioCallSid,
        eventType: 'retry_scheduled',
        eventPayload: JSON.stringify({
          retryCallJobId: retryCallJob.id,
          scheduledFor: scheduledFor?.toISOString() ?? null,
          retryAttempt: nextAttempt,
        }),
      },
    })
    .catch(() => null)

  let relatedTaskId: string | null = null
  if (input.createFollowUpTask || !retryRecommendation.shouldRetry) {
    const task = await createFollowUpTaskForCall(
      original,
      retryRecommendation,
      finalOutcome,
      `Retry scheduled (${retryReason}).`,
    )
    relatedTaskId = task.id
    await prisma.staffTask
      .update({
        where: { id: task.id },
        data: {
          activityJson: JSON.stringify([
            {
              id: `act-retry-${Date.now()}`,
              type: 'note',
              message: `Retry scheduled for ${scheduledFor?.toLocaleString() ?? 'soon'} (attempt ${nextAttempt}).`,
              timestamp: new Date().toISOString(),
              actor: 'System',
            },
          ]),
        },
      })
      .catch(() => null)
  }

  if (relatedTaskId) {
    await prisma.callJob.update({
      where: { id: retryCallJob.id },
      data: { relatedTaskId },
    })
    retryCallJob.relatedTaskId = relatedTaskId
  }

  let placedJob = retryCallJob
  if (input.placeImmediately) {
    try {
      placedJob = (await startCallJobById(retryCallJob.id)) as CallJob
      await prisma.callJob.update({
        where: { id: retryCallJob.id },
        data: { retryStatus: 'in_progress', callStatus: placedJob.callStatus ?? 'dialing' },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not place retry call immediately'
      await prisma.callJob.update({
        where: { id: retryCallJob.id },
        data: {
          retryStatus: 'blocked',
          callStatus: 'scheduled',
          errorMessage: message,
        },
      })
      placedJob = (await prisma.callJob.findUnique({ where: { id: retryCallJob.id } })) ?? retryCallJob
    }
  }

  return {
    ok: true as const,
    existing: false as const,
    originalCallJob: original,
    retryCallJob: placedJob,
    retryRecommendation,
  }
}

const STALE_ACTIVE_STATUSES = ['queued_live', 'dialing', 'ringing', 'in_progress'] as const
const STALE_CALL_TIMEOUT_MS = 5 * 60 * 1000

export async function markStaleActiveCalls(): Promise<{ marked: number }> {
  const cutoff = new Date(Date.now() - STALE_CALL_TIMEOUT_MS)
  const staleJobs = await prisma.callJob.findMany({
    where: {
      callStatus: { in: [...STALE_ACTIVE_STATUSES] },
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      patientName: true,
      phoneNumber: true,
      medicationName: true,
      callReason: true,
      twilioCallSid: true,
    },
    take: 50,
  })

  let marked = 0
  for (const job of staleJobs) {
    try {
      await prisma.callJob.update({
        where: { id: job.id },
        data: {
          callStatus: 'needs_review',
          resolutionStatus: 'needs_review',
          staffFollowUpNeeded: true,
          followUpReason: 'Carrier callback missing or tunnel unavailable',
          callCompletedAt: new Date(),
        },
      })

      await prisma.callEvent.create({
        data: {
          callJobId: job.id,
          twilioCallSid: job.twilioCallSid,
          eventType: 'stale_call_marked',
          eventPayload: JSON.stringify({
            reason: 'No callback received within timeout window',
            markedAt: new Date().toISOString(),
          }),
        },
      }).catch(() => null)

      const existingTask = await prisma.staffTask.findFirst({
        where: { callJobId: job.id, status: { in: ['open', 'in_progress'] } },
      })
      if (!existingTask) {
        await prisma.staffTask.create({
          data: {
            callJobId: job.id,
            patientName: job.patientName,
            phoneNumber: job.phoneNumber,
            medicationName: job.medicationName,
            taskType: 'failed_call',
            priority: 'high',
            status: 'open',
            notes: 'Carrier callback missing or tunnel unavailable',
            assignedTeam: 'Unassigned',
            dueDate: new Date().toISOString().slice(0, 10),
            dueTime: '15:00',
            sourceWorkflow: mapCallReasonToWorkflow(job.callReason as import('../config.js').CallReason),
            issueSummary: 'Call stuck in active state with no callback — possible tunnel or carrier issue.',
          },
        }).catch(() => null)
      }

      marked++
    } catch {
      // Non-critical — continue processing remaining jobs
    }
  }

  if (marked > 0) {
    console.log(`[stale-cleanup] Marked ${marked} stale active call(s) as needs_review`)
  }

  return { marked }
}

/**
 * Run dashboard-batch-scheduled calls that are now due.
 * Handles original (non-retry) call jobs scheduled via the "Schedule queued" button.
 */
export async function runDueBatchScheduledCalls(): Promise<{
  processed: number
  results: Array<{ callJobId: string; status: 'started' | 'blocked' | 'failed'; message: string }>
}> {
  const now = new Date()

  // Original jobs only — retries are handled by runDueScheduledRetries
  const dueJobs = await prisma.callJob.findMany({
    where: {
      callStatus: 'scheduled',
      scheduledFor: { lte: now },
      twilioCallSid: null,
      retryOfCallJobId: null,
      validationStatus: 'valid',
    },
    orderBy: { scheduledFor: 'asc' },
    select: {
      id: true,
      patientName: true,
      phoneNumber: true,
      scheduledFor: true,
    },
    take: 25,
  })

  if (dueJobs.length === 0) return { processed: 0, results: [] }

  const readiness = phoneProvider.getReadiness()
  const canDial = config.autoCallTestMode || (phoneProvider.isConfigured() && readiness.ready)

  const results: Array<{ callJobId: string; status: 'started' | 'blocked' | 'failed'; message: string }> = []

  for (const job of dueJobs) {
    if (!canDial) {
      // Atomic claim before marking blocked — avoids overwriting a concurrent runner's work
      const claim = await prisma.callJob.updateMany({
        where: {
          id: job.id,
          callStatus: 'scheduled',
          twilioCallSid: null,
          retryOfCallJobId: null,
          validationStatus: 'valid',
          scheduledFor: { lte: now },
        },
        data: { callStatus: 'queued', retryStatus: 'blocked', errorMessage: readiness.issues.join(' ') || `${phoneProvider.displayName} is not ready.` },
      }).catch(() => ({ count: 0 }))
      if (claim.count === 0) {
        console.log(`[batch-scheduler] Skipped ${job.id} — already claimed or no longer eligible`)
        continue
      }
      const message = readiness.issues.join(' ') || `${phoneProvider.displayName} is not ready.`
      results.push({ callJobId: job.id, status: 'blocked', message })
      continue
    }

    // Atomic claim: updateMany returns count === 0 if another runner already claimed this job
    const claim = await prisma.callJob.updateMany({
      where: {
        id: job.id,
        callStatus: 'scheduled',   // must still be in original scheduled state
        twilioCallSid: null,        // not already dialing
        retryOfCallJobId: null,     // original batch job, not a retry
        validationStatus: 'valid',
        scheduledFor: { lte: now },
      },
      data: { retryStatus: 'in_progress', callStatus: 'queued' },
    }).catch(() => ({ count: 0 }))

    if (claim.count === 0) {
      console.log(`[batch-scheduler] Skipped ${job.id} — already claimed or no longer eligible`)
      continue
    }

    try {
      await startCallJobById(job.id)
      await prisma.callEvent.create({
        data: {
          callJobId: job.id,
          twilioCallSid: null,
          eventType: 'batch_scheduler_fired',
          eventPayload: JSON.stringify({
            scheduledFor: job.scheduledFor?.toISOString() ?? null,
            firedAt: now.toISOString(),
          }),
        },
      }).catch(() => null)
      console.log(`[batch-scheduler] Started call for ${job.patientName} (${job.id})`)
      results.push({ callJobId: job.id, status: 'started', message: 'Batch scheduled call started.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Batch call start failed'
      await prisma.callJob.update({
        where: { id: job.id },
        data: {
          callStatus: 'failed',
          callCompletedAt: new Date(),
          errorMessage: message,
          staffFollowUpNeeded: true,
          followUpReason: 'Batch-scheduled call could not be started',
          retryStatus: 'blocked',
        },
      }).catch(() => null)
      console.error(`[batch-scheduler] Failed to start call ${job.id}: ${message}`)
      results.push({ callJobId: job.id, status: 'failed', message })
    }
  }

  if (results.length > 0) {
    console.log(
      `[batch-scheduler] Processed ${results.length} due call(s): ` +
      `${results.filter((r) => r.status === 'started').length} started, ` +
      `${results.filter((r) => r.status === 'failed').length} failed, ` +
      `${results.filter((r) => r.status === 'blocked').length} blocked`,
    )
  }

  return { processed: results.length, results }
}

export async function runDueScheduledRetries() {
  const now = new Date()
  const dueJobs = await prisma.callJob.findMany({
    where: {
      retryStatus: 'scheduled',
      scheduledFor: { lte: now },
      twilioCallSid: null,
      callStatus: { in: ['scheduled', 'queued'] },
      // Retry jobs only — batch originals handled by runDueBatchScheduledCalls
      retryOfCallJobId: { not: null },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 25,
  })

  const readiness = phoneProvider.getReadiness()
  const canStartCall = config.autoCallTestMode || (phoneProvider.isConfigured() && readiness.ready)

  const results: Array<{
    callJobId: string
    status: 'started' | 'blocked' | 'failed'
    message: string
  }> = []

  for (const job of dueJobs) {
    if (!canStartCall) {
      const message =
        readiness.issues.join(' ') ||
        `${phoneProvider.displayName} is not ready. Scheduled retry remains queued. Trial accounts can only call verified numbers.`
      // Atomic claim before blocking — prevents concurrent runner from also updating
      const claim = await prisma.callJob.updateMany({
        where: {
          id: job.id,
          retryStatus: 'scheduled',
          callStatus: { in: ['scheduled', 'queued'] },
          twilioCallSid: null,
          retryOfCallJobId: { not: null },
          scheduledFor: { lte: now },
        },
        data: { retryStatus: 'blocked', errorMessage: message },
      }).catch(() => ({ count: 0 }))
      if (claim.count === 0) {
        console.log(`[retry-scheduler] Skipped ${job.id} — already claimed or no longer eligible`)
        continue
      }
      results.push({ callJobId: job.id, status: 'blocked', message })
      continue
    }

    // Atomic claim: only proceed if the job is still in the exact qualifying state
    const claim = await prisma.callJob.updateMany({
      where: {
        id: job.id,
        retryStatus: 'scheduled',                    // must not have been claimed already
        callStatus: { in: ['scheduled', 'queued'] }, // not yet active or terminal
        twilioCallSid: null,                          // no call in flight
        retryOfCallJobId: { not: null },              // retry jobs only
        scheduledFor: { lte: now },
      },
      data: { retryStatus: 'in_progress', callStatus: 'queued' },
    }).catch(() => ({ count: 0 }))

    if (claim.count === 0) {
      console.log(`[retry-scheduler] Skipped ${job.id} — already claimed or no longer eligible`)
      continue
    }

    try {
      await startCallJobById(job.id)
      results.push({ callJobId: job.id, status: 'started', message: 'Due retry call initiated.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Retry execution failed'
      await prisma.callJob.update({
        where: { id: job.id },
        data: { retryStatus: 'blocked', errorMessage: message },
      })
      results.push({ callJobId: job.id, status: 'failed', message })
    }
  }

  return { processed: results.length, results, twilioReady: canStartCall, phoneProviderReady: canStartCall }
}
