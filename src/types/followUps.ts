export type FollowUpPriority = 'Urgent' | 'High' | 'Medium' | 'Low'

export type FollowUpStatus = 'Open' | 'In Progress' | 'Completed' | 'Cancelled'

export type FollowUpTaskType =
  | 'Callback'
  | 'Pharmacist Review'
  | 'Insurance Issue'
  | 'Prior Authorization'
  | 'Delivery Issue'
  | 'No Answer'
  | 'Failed Call'
  | 'Medication Adherence'
  | 'Refill Request'
  | 'Invalid Row'

export type SourceWorkflow =
  | 'Refill Reminder'
  | 'Prescription Pickup'
  | 'Delivery Confirmation'
  | 'PA Follow-up'
  | 'Insurance Issue'
  | 'Medication Adherence'

export type AssignedTeam =
  | 'Unassigned'
  | 'Pharmacist'
  | 'Technician'
  | 'Billing Team'
  | 'Delivery Team'
  | 'Pharmacy Manager'

export type ActivityType =
  | 'created'
  | 'assigned'
  | 'note'
  | 'status_changed'
  | 'rescheduled'
  | 'completed'
  | 'cancelled'
  | 'call_outcome'
  | 'priority_changed'
  | 'due_date_changed'

export interface FollowUpActivity {
  id: string
  type: ActivityType
  message: string
  timestamp: string
  actor?: string
}

export interface FollowUpTask {
  id: string
  patientName: string
  patientMasked: string
  phoneMasked: string
  taskType: FollowUpTaskType
  priority: FollowUpPriority
  status: FollowUpStatus
  sourceWorkflow: SourceWorkflow
  relatedCallId?: string
  relatedCallAt?: string
  relatedCallOutcome?: string
  relatedCallStatus?: string
  createdFromCall?: boolean
  dueDate: string
  dueTime: string
  assignedTeam: AssignedTeam
  issueSummary: string
  staffNotes?: string
  aiRecommendedAction: string
  activity: FollowUpActivity[]
  lastActivityAt: string
  createdAt: string
  updatedAt: string
}

export type PriorityTab = 'all' | 'urgent' | 'open' | 'in_progress' | 'completed' | 'cancelled' | 'overdue' | 'from_call'

export type PriorityFilter = 'all' | FollowUpPriority

export type TaskTypeFilter = 'all' | FollowUpTaskType

export type AssignedFilter = 'all' | AssignedTeam

export type DueDateFilter = 'today' | 'tomorrow' | 'this_week' | 'overdue' | 'all'

export type SortOption =
  | 'priority_first'
  | 'due_soon'
  | 'newest'
  | 'oldest'
  | 'recently_updated'

export type StatusFilter = 'all' | FollowUpStatus

export type CreatedFromCallFilter = 'all' | 'yes' | 'no'

export interface FollowUpFilters {
  search: string
  priorityTab: PriorityTab
  status: StatusFilter
  priority: PriorityFilter
  taskType: TaskTypeFilter
  assigned: AssignedFilter
  dueDate: DueDateFilter
  createdFromCall: CreatedFromCallFilter
  sort: SortOption
}

export interface CreateTaskInput {
  patientMasked: string
  phoneMasked: string
  taskType: FollowUpTaskType
  priority: FollowUpPriority
  assignedTeam: AssignedTeam
  dueDate: string
  dueTime: string
  issueSummary: string
  notes?: string
}
