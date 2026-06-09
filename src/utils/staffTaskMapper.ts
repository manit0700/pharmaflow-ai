import type {
  AssignedTeam,
  FollowUpActivity,
  FollowUpPriority,
  FollowUpStatus,
  FollowUpTask,
  FollowUpTaskType,
  SourceWorkflow,
} from '@/types/followUps'
import type { StaffTask, TaskActivity } from '@/utils/api'

function defaultCreatedActivity(createdAt: string): FollowUpActivity {
  return {
    id: `act-created-${createdAt}`,
    type: 'created',
    message: 'Follow-up task created.',
    timestamp: createdAt,
    actor: 'System',
  }
}

const CALL_REASON_TO_WORKFLOW: Record<string, SourceWorkflow> = {
  refill_reminder: 'Refill Reminder',
  pickup_reminder: 'Prescription Pickup',
  delivery_update: 'Delivery Confirmation',
  insurance_update: 'Insurance Issue',
  general_callback: 'Refill Reminder',
}

const TASK_TYPE_TO_API: Record<FollowUpTaskType, string> = {
  Callback: 'callback_requested',
  'Pharmacist Review': 'pharmacist_review',
  'Insurance Issue': 'insurance_review',
  'Prior Authorization': 'prior_auth',
  'Delivery Issue': 'delivery_issue',
  'No Answer': 'no_answer',
  'Failed Call': 'failed_call',
  'Medication Adherence': 'medication_adherence',
  'Refill Request': 'refill_request',
  'Invalid Row': 'invalid_excel_row',
}

const API_TO_TASK_TYPE: Record<string, FollowUpTaskType> = {
  follow_up: 'Callback',
  callback: 'Callback',
  callback_requested: 'Callback',
  callback_request: 'Callback',
  pharmacist_review: 'Pharmacist Review',
  insurance_issue: 'Insurance Issue',
  insurance_review: 'Insurance Issue',
  insurance: 'Insurance Issue',
  prior_auth: 'Prior Authorization',
  delivery_issue: 'Delivery Issue',
  no_answer: 'No Answer',
  failed_call: 'Failed Call',
  medication_adherence: 'Medication Adherence',
  refill_request: 'Refill Request',
  invalid_excel_row: 'Invalid Row',
  patient_request: 'Pharmacist Review',
  dob_failed: 'Pharmacist Review',
  inbound_handoff: 'Pharmacist Review',
}

export function maskPatientName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return 'Patient'
  if (parts.length === 1) return parts[0].length > 2 ? `${parts[0].slice(0, 1)}.` : parts[0]
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const last4 = digits.slice(-4) || '0000'
  return `(***) ***-${last4}`
}

function mapPriorityFromApi(priority: string): FollowUpPriority {
  const p = priority.toLowerCase()
  if (p === 'urgent') return 'Urgent'
  if (p === 'high') return 'High'
  if (p === 'low') return 'Low'
  return 'Medium'
}

export function mapPriorityToApi(priority: FollowUpPriority): string {
  if (priority === 'Urgent') return 'urgent'
  if (priority === 'High') return 'high'
  if (priority === 'Low') return 'low'
  return 'normal'
}

function mapStatusFromApi(status: string): FollowUpStatus {
  const s = status.toLowerCase()
  if (s === 'in_progress' || s === 'in progress') return 'In Progress'
  if (s === 'completed') return 'Completed'
  return 'Open'
}

export function mapStatusToApi(status: FollowUpStatus): string {
  if (status === 'In Progress') return 'in_progress'
  if (status === 'Completed') return 'completed'
  return 'open'
}

function mapTaskTypeFromApi(taskType: string): FollowUpTaskType {
  return API_TO_TASK_TYPE[taskType.toLowerCase()] ?? 'Callback'
}

export function mapTaskTypeToApi(taskType: FollowUpTaskType): string {
  return TASK_TYPE_TO_API[taskType] ?? 'follow_up'
}

function mapActivityTypeFromApi(activityType: string): FollowUpActivity['type'] {
  const normalized = activityType.toLowerCase()
  if (normalized === 'task_created' || normalized === 'created') return 'created'
  if (normalized === 'assignment' || normalized === 'assigned') return 'assigned'
  if (normalized === 'note_added' || normalized === 'note') return 'note'
  if (normalized === 'status_change' || normalized === 'status_changed' || normalized === 'task_updated') {
    return 'status_changed'
  }
  if (normalized === 'rescheduled') return 'rescheduled'
  if (normalized === 'completed') return 'completed'
  if (normalized === 'call_outcome_detected' || normalized === 'call_outcome') return 'call_outcome'
  return 'created'
}

function mapTaskActivities(
  taskActivities: TaskActivity[] | undefined,
  json: string | null | undefined,
  createdAt: string,
): FollowUpActivity[] {
  if (taskActivities && taskActivities.length > 0) {
    return [...taskActivities]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((item) => ({
        id: item.id,
        type: mapActivityTypeFromApi(item.activityType),
        message: item.message,
        timestamp: item.createdAt,
        actor: item.actor === 'workflow-engine' ? 'System' : item.actor,
      }))
  }

  if (json) {
    try {
      const parsed = JSON.parse(json) as FollowUpActivity[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      // fall through
    }
  }
  return [defaultCreatedActivity(createdAt)]
}

function defaultDueDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function staffTaskToFollowUp(task: StaffTask): FollowUpTask {
  const workflow =
    (task.sourceWorkflow as SourceWorkflow | null) ??
    (task.callJob?.callReason ? CALL_REASON_TO_WORKFLOW[task.callJob.callReason] : undefined) ??
    'Refill Reminder'

  const relatedCallAt =
    task.callJob?.callCompletedAt ?? task.callJob?.callAttemptedAt ?? undefined

  const issueSummary =
    task.issueSummary ?? task.notes ?? task.callJob?.followUpReason ?? 'Staff follow-up required.'

  const activity = mapTaskActivities(task.taskActivities, task.activityJson, task.createdAt)
  const lastActivityAt = activity.reduce(
    (latest, item) => (item.timestamp > latest ? item.timestamp : latest),
    task.updatedAt ?? task.createdAt,
  )

  return {
    id: task.id,
    patientName: task.patientName,
    patientMasked: maskPatientName(task.patientName),
    phoneMasked: maskPhone(task.phoneNumber),
    taskType: mapTaskTypeFromApi(task.taskType),
    priority: mapPriorityFromApi(task.priority),
    status: mapStatusFromApi(task.status),
    sourceWorkflow: workflow,
    relatedCallId: task.callJobId ?? task.callJob?.id,
    relatedCallAt: relatedCallAt ?? undefined,
    relatedCallOutcome: task.callJob?.patientResponse ?? task.callJob?.followUpReason ?? undefined,
    relatedCallStatus: task.callJob?.callStatus ?? undefined,
    createdFromCall: Boolean(task.callJobId ?? task.callJob?.id),
    dueDate: task.dueDate ?? defaultDueDate(),
    dueTime: task.dueTime ?? '15:00',
    assignedTeam: (task.assignedTeam as AssignedTeam) ?? 'Unassigned',
    issueSummary,
    aiRecommendedAction:
      task.aiSummary ?? 'Review task details and take appropriate follow-up action.',
    activity,
    lastActivityAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt ?? task.createdAt,
  }
}

export function followUpToStaffTaskPayload(task: FollowUpTask): Record<string, string | null> {
  return {
    patientName: task.patientMasked,
    phoneNumber: task.phoneMasked,
    taskType: mapTaskTypeToApi(task.taskType),
    priority: mapPriorityToApi(task.priority),
    status: mapStatusToApi(task.status),
    assignedTeam: task.assignedTeam,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    sourceWorkflow: task.sourceWorkflow,
    issueSummary: task.issueSummary,
    aiSummary: task.aiRecommendedAction,
    activityJson: JSON.stringify(task.activity),
    notes: task.issueSummary,
  }
}

export function isMockFollowUpId(id: string): boolean {
  return id.startsWith('fu-') || id.startsWith('fu-demo-')
}
