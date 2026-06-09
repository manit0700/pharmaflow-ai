import { prisma } from '../lib/prisma.js'
import { mapCallReasonToWorkflow } from './callOutcome.js'

export type FollowUpOutcome =
  | 'no_answer'
  | 'failed'
  | 'busy'
  | 'voicemail'
  | 'callback_requested'
  | 'escalated'
  | 'pharmacist_review'
  | 'insurance_review'
  | 'delivery_issue'
  | 'refill_request'
  | 'invalid_excel_row'
  | 'ended_early'
  | 'dob_failed'
  | 'inbound_handoff'

type CallJobRecord = {
  id: string
  patientName: string
  phoneNumber: string
  medicationName: string
  callReason: string
  callStatus: string
  patientResponse?: string | null
  followUpReason?: string | null
  staffFollowUpNeeded?: boolean
  aiSummary?: string | null
  validationStatus?: string
  validationError?: string | null
  twilioCallSid?: string | null
  relatedTaskId?: string | null
}

type OutcomeConfig = {
  taskType: string
  priority: string
  activityMessage: string
  issueSummary: (job: CallJobRecord) => string
  staffFollowUp: boolean
  resolutionStatus?: string
}

const OUTCOME_CONFIG: Record<FollowUpOutcome, OutcomeConfig> = {
  no_answer: {
    taskType: 'no_answer',
    priority: 'normal',
    activityMessage: 'No answer detected. Retry follow-up task created.',
    issueSummary: () => 'Patient did not answer the outbound call.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  failed: {
    taskType: 'failed_call',
    priority: 'high',
    activityMessage: 'Call failed. Follow-up task created for staff review.',
    issueSummary: (job) => job.followUpReason ?? 'Outbound call failed before completion.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  busy: {
    taskType: 'failed_call',
    priority: 'normal',
    activityMessage: 'Line was busy. Follow-up task created.',
    issueSummary: () => 'Patient line was busy when the call was placed.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  voicemail: {
    taskType: 'no_answer',
    priority: 'normal',
    activityMessage: 'Voicemail detected. Follow-up task created.',
    issueSummary: () => 'Call reached voicemail. Staff may retry or leave callback instructions.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  callback_requested: {
    taskType: 'callback_requested',
    priority: 'high',
    activityMessage: 'Patient requested a callback.',
    issueSummary: (job) => job.patientResponse ?? job.followUpReason ?? 'Patient requested a callback.',
    staffFollowUp: true,
    resolutionStatus: 'callback',
  },
  escalated: {
    taskType: 'pharmacist_review',
    priority: 'urgent',
    activityMessage: 'Call escalated to pharmacy team.',
    issueSummary: (job) => job.followUpReason ?? job.patientResponse ?? 'Call escalated for pharmacist review.',
    staffFollowUp: true,
    resolutionStatus: 'escalated',
  },
  pharmacist_review: {
    taskType: 'pharmacist_review',
    priority: 'urgent',
    activityMessage: 'Patient requested pharmacist or staff assistance.',
    issueSummary: (job) => job.patientResponse ?? job.followUpReason ?? 'Pharmacist review requested on call.',
    staffFollowUp: true,
    resolutionStatus: 'escalated',
  },
  insurance_review: {
    taskType: 'insurance_review',
    priority: 'high',
    activityMessage: 'Insurance-related issue detected.',
    issueSummary: (job) => job.patientResponse ?? job.followUpReason ?? 'Insurance update requires staff review.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  delivery_issue: {
    taskType: 'delivery_issue',
    priority: 'normal',
    activityMessage: 'Delivery coordination issue detected.',
    issueSummary: (job) => job.patientResponse ?? job.followUpReason ?? 'Delivery coordination requires follow-up.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  refill_request: {
    taskType: 'refill_request',
    priority: 'normal',
    activityMessage: 'Patient confirmed refill request on call.',
    issueSummary: (job) => job.patientResponse ?? 'Patient confirmed refill processing on call.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  invalid_excel_row: {
    taskType: 'invalid_excel_row',
    priority: 'normal',
    activityMessage: 'Invalid Excel row requires staff review.',
    issueSummary: (job) => job.validationError ?? 'Imported row failed validation and needs correction.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  ended_early: {
    taskType: 'callback_requested',
    priority: 'normal',
    activityMessage: 'Call ended before patient response. Callback follow-up created.',
    issueSummary: (job) => job.followUpReason ?? 'Call ended before the patient completed the menu.',
    staffFollowUp: true,
    resolutionStatus: 'pending',
  },
  dob_failed: {
    taskType: 'pharmacist_review',
    priority: 'high',
    activityMessage: 'DOB verification failed on call. Staff follow-up required.',
    issueSummary: () => 'Patient could not verify date of birth during outbound call.',
    staffFollowUp: true,
    resolutionStatus: 'escalated',
  },
  inbound_handoff: {
    taskType: 'pharmacist_review',
    priority: 'urgent',
    activityMessage: 'Inbound caller requested staff assistance.',
    issueSummary: () => 'Inbound caller pressed 0 for pharmacy staff.',
    staffFollowUp: true,
    resolutionStatus: 'escalated',
  },
}

const OPEN_TASK_STATUSES = ['open', 'in_progress']

function serializeMetadata(metadata: Record<string, unknown>): string {
  return JSON.stringify(metadata)
}

export function maskPatientName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Patient'
  if (parts.length === 1) return parts[0].length > 2 ? `${parts[0].slice(0, 1)}.` : parts[0]
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const last4 = digits.slice(-4) || '0000'
  return `(***) ***-${last4}`
}

export async function appendTaskActivity(
  taskId: string,
  activityType: string,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  await prisma.taskActivity.create({
    data: {
      taskId,
      activityType,
      message,
      actor: 'workflow-engine',
      metadataJson: serializeMetadata(metadata),
    },
  })
}

export async function createAuditEvent(
  entityType: string,
  entityId: string | null,
  action: string,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  await prisma.auditEvent.create({
    data: {
      entityType,
      entityId,
      action,
      actor: 'workflow-engine',
      message,
      metadataJson: serializeMetadata(metadata),
    },
  })
}

async function persistSideEffects(promises: Promise<unknown>[]) {
  const results = await Promise.allSettled(promises)
  for (const result of results) {
    if (result.status === 'rejected') {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
      console.warn('Follow-up side effect failed:', message)
    }
  }
}

export function resolveOutcomeFromCallJob(job: CallJobRecord): FollowUpOutcome | null {
  const status = job.callStatus.toLowerCase()
  const response = (job.patientResponse ?? '').trim()
  const responseLower = response.toLowerCase()
  const reason = job.callReason.toLowerCase()

  if (job.validationStatus === 'invalid' || status === 'invalid') return 'invalid_excel_row'
  if (status === 'no_answer') return 'no_answer'
  if (status === 'failed') return 'failed'
  if (status === 'busy') return 'busy'
  if (status === 'voicemail' || response === 'Voicemail') return 'voicemail'
  if (status === 'callback_requested') return 'callback_requested'
  if (status === 'escalated') return 'escalated'

  if (response === 'DOB verification failed') return 'dob_failed'
  if (response === 'Call ended before patient selected a response') return 'ended_early'

  if (responseLower.includes('confirmed refill') || responseLower.includes('process today')) {
    return 'refill_request'
  }
  if (responseLower.includes('callback') || responseLower.includes('call back')) {
    return 'callback_requested'
  }
  if (
    responseLower.includes('pharmacist') ||
    responseLower.includes('requested pharmacist') ||
    responseLower.includes('escalation')
  ) {
    return 'pharmacist_review'
  }
  if (responseLower.includes('insurance')) return 'insurance_review'
  if (responseLower.includes('delivery') && responseLower.includes('reschedule')) {
    return 'delivery_issue'
  }
  if (reason.includes('delivery') && job.staffFollowUpNeeded && responseLower.includes('reschedule')) {
    return 'delivery_issue'
  }
  if (reason.includes('insurance') && job.staffFollowUpNeeded) return 'insurance_review'

  if (job.staffFollowUpNeeded) {
    if (status === 'escalated') return 'escalated'
    if (job.followUpReason?.toLowerCase().includes('insurance')) return 'insurance_review'
    if (job.followUpReason?.toLowerCase().includes('delivery')) return 'delivery_issue'
    if (job.followUpReason?.toLowerCase().includes('callback')) return 'callback_requested'
    return 'pharmacist_review'
  }

  return null
}

export function resolveOutcomeFromPatientAction(params: {
  patientResponse: string
  action?: 'complete' | 'transfer' | 'callback'
  callReason: string
}): FollowUpOutcome | null {
  const responseLower = params.patientResponse.toLowerCase()
  if (params.action === 'callback' || responseLower.includes('callback')) return 'callback_requested'
  if (params.action === 'transfer' || responseLower.includes('pharmacist')) return 'pharmacist_review'
  if (responseLower.includes('confirmed refill') || responseLower.includes('process today')) {
    return 'refill_request'
  }
  if (responseLower.includes('insurance')) return 'insurance_review'
  if (responseLower.includes('delivery') && responseLower.includes('reschedule')) {
    return 'delivery_issue'
  }
  if (params.callReason.includes('insurance') && params.action === 'transfer') return 'insurance_review'
  if (params.callReason.includes('delivery') && params.action === 'transfer') return 'delivery_issue'
  return null
}

async function findExistingOpenTask(callJobId: string, taskType: string) {
  return prisma.staffTask.findFirst({
    where: {
      callJobId,
      taskType,
      status: { in: OPEN_TASK_STATUSES },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      taskActivities: { orderBy: { createdAt: 'desc' }, take: 5 },
      callJob: {
        select: {
          id: true,
          callReason: true,
          callStatus: true,
          patientResponse: true,
          callCompletedAt: true,
          callAttemptedAt: true,
          followUpReason: true,
        },
      },
    },
  })
}

export async function ensureFollowUpTaskForCallOutcome(
  job: CallJobRecord,
  outcome: FollowUpOutcome,
  options: { skipCallJobLink?: boolean; extraNote?: string; callJobId?: string | null } = {},
): Promise<{ task: Awaited<ReturnType<typeof prisma.staffTask.create>> | null; created: boolean }> {
  const config = OUTCOME_CONFIG[outcome]
  if (!config) return { task: null, created: false }

  const linkedCallJobId = options.callJobId === undefined ? job.id : options.callJobId
  const existing =
    linkedCallJobId != null ? await findExistingOpenTask(linkedCallJobId, config.taskType) : null
  if (existing) {
    await persistSideEffects([
      appendTaskActivity(existing.id, 'call_outcome_detected', config.activityMessage, {
        outcome,
        callJobId: job.id,
        duplicatePrevented: true,
      }),
    ])
    return { task: existing, created: false }
  }

  const issueSummary = options.extraNote ?? config.issueSummary(job)
  const maskedName = maskPatientName(job.patientName)

  const task = await prisma.staffTask.create({
    data: {
      callJobId: linkedCallJobId,
      patientName: job.patientName,
      phoneNumber: job.phoneNumber,
      medicationName: job.medicationName,
      taskType: config.taskType,
      priority: config.priority,
      status: 'open',
      notes: issueSummary,
      aiSummary: job.aiSummary,
      assignedTeam: 'Unassigned',
      dueDate: new Date().toISOString().slice(0, 10),
      dueTime: '15:00',
      sourceWorkflow: mapCallReasonToWorkflow(job.callReason),
      issueSummary,
    },
    include: {
      taskActivities: true,
      callJob: {
        select: {
          id: true,
          callReason: true,
          callStatus: true,
          patientResponse: true,
          callCompletedAt: true,
          callAttemptedAt: true,
          followUpReason: true,
        },
      },
    },
  })

  await persistSideEffects([
    appendTaskActivity(task.id, 'task_created', `Follow-up task created for ${maskedName}.`, {
      taskType: config.taskType,
      priority: config.priority,
      outcome,
      callJobId: job.id,
    }),
    appendTaskActivity(task.id, 'call_outcome_detected', config.activityMessage, {
      outcome,
      callStatus: job.callStatus,
    }),
    createAuditEvent('staff_task', task.id, 'FOLLOW_UP_TASK_CREATED', 'Follow-up task created from call outcome.', {
      callJobId: job.id,
      taskType: config.taskType,
      outcome,
    }),
    createAuditEvent('call_job', job.id, 'CALL_OUTCOME_RECORDED', 'Call outcome recorded for follow-up workflow.', {
      outcome,
      callStatus: job.callStatus,
      taskId: task.id,
    }),
    config.staffFollowUp && !options.skipCallJobLink && linkedCallJobId
      ? prisma.callJob.update({
          where: { id: linkedCallJobId },
          data: {
            staffFollowUpNeeded: true,
            followUpReason: job.followUpReason ?? issueSummary,
            relatedTaskId: task.id,
            resolutionStatus: config.resolutionStatus ?? job.callStatus,
          },
        })
      : Promise.resolve(),
    job.staffFollowUpNeeded && config.priority === 'urgent'
      ? createAuditEvent('call_job', job.id, 'HUMAN_REVIEW_REQUIRED', 'Human review required for call outcome.', {
          taskId: task.id,
          outcome,
        })
      : Promise.resolve(),
  ])

  return { task, created: true }
}

export async function createFollowUpTaskFromCallJob(
  callJobId: string,
  reason?: string,
): Promise<{ task: Awaited<ReturnType<typeof prisma.staffTask.create>> | null; created: boolean }> {
  const job = await prisma.callJob.findUnique({ where: { id: callJobId } })
  if (!job) return { task: null, created: false }

  const outcome = reason
    ? (reason as FollowUpOutcome)
    : resolveOutcomeFromCallJob(job)
  if (!outcome) return { task: null, created: false }

  return ensureFollowUpTaskForCallOutcome(job, outcome)
}

export async function ensureFollowUpTaskForCallJob(
  callJobId: string,
): Promise<{ task: Awaited<ReturnType<typeof prisma.staffTask.create>> | null; created: boolean }> {
  const job = await prisma.callJob.findUnique({ where: { id: callJobId } })
  if (!job) return { task: null, created: false }

  const outcome = resolveOutcomeFromCallJob(job)
  if (!outcome) return { task: null, created: false }

  return ensureFollowUpTaskForCallOutcome(job, outcome)
}

export async function ensureFollowUpForInvalidRow(job: CallJobRecord) {
  if (job.validationStatus !== 'invalid') return { task: null, created: false }
  return ensureFollowUpTaskForCallOutcome(job, 'invalid_excel_row')
}
