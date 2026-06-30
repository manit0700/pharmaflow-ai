import type {
  AssignedTeam,
  CreateTaskInput,
  FollowUpActivity,
  FollowUpFilters,
  FollowUpPriority,
  FollowUpStatus,
  FollowUpTask,
  FollowUpTaskType,
  SortOption,
  SourceWorkflow,
} from '@/types/followUps'

export type { FollowUpStatus }

const PRIORITY_ORDER: Record<FollowUpPriority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

export function isTaskTerminal(task: FollowUpTask): boolean {
  return task.status === 'Completed' || task.status === 'Cancelled'
}

export function isTaskOverdue(task: FollowUpTask, now = new Date()): boolean {
  if (isTaskTerminal(task)) return false
  const due = new Date(`${task.dueDate}T${task.dueTime}:00`)
  return due < now
}

export function formatDueDisplay(task: FollowUpTask, now = new Date()): string {
  const due = new Date(`${task.dueDate}T${task.dueTime}:00`)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dueDay = new Date(due)
  dueDay.setHours(0, 0, 0, 0)

  const timeStr = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (dueDay.getTime() === today.getTime()) return `Today, ${timeStr}`
  if (dueDay.getTime() === tomorrow.getTime()) return `Tomorrow, ${timeStr}`
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${timeStr}`
}

export function formatActivityTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)

  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (day.getTime() === today.getTime()) return `Today, ${timeStr}`
  if (day.getTime() === yesterday.getTime()) return `Yesterday, ${timeStr}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${timeStr}`
}

export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function matchesDueDateFilter(task: FollowUpTask, filter: FollowUpFilters['dueDate'], now = new Date()): boolean {
  if (filter === 'all') return true
  const due = new Date(`${task.dueDate}T${task.dueTime}:00`)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const dueDay = new Date(due)
  dueDay.setHours(0, 0, 0, 0)

  if (filter === 'overdue') return isTaskOverdue(task, now)
  if (filter === 'today') return dueDay.getTime() === today.getTime()
  if (filter === 'tomorrow') return dueDay.getTime() === tomorrow.getTime()
  if (filter === 'this_week') return due >= today && due < weekEnd
  return true
}

function matchesPriorityTab(task: FollowUpTask, tab: FollowUpFilters['priorityTab']): boolean {
  if (tab === 'all') return true
  if (tab === 'urgent') return task.priority === 'Urgent' && !isTaskTerminal(task)
  if (tab === 'open') return task.status === 'Open'
  if (tab === 'in_progress') return task.status === 'In Progress'
  if (tab === 'completed') return task.status === 'Completed'
  if (tab === 'cancelled') return task.status === 'Cancelled'
  if (tab === 'overdue') return isTaskOverdue(task)
  if (tab === 'from_call') return Boolean(task.createdFromCall)
  return true
}

function matchesSearch(task: FollowUpTask, search: string): boolean {
  if (!search.trim()) return true
  const q = search.toLowerCase()
  const haystack = [
    task.patientName,
    task.patientMasked,
    task.phoneMasked,
    task.sourceWorkflow,
    task.taskType,
    task.issueSummary,
    task.assignedTeam,
    task.aiRecommendedAction,
    ...task.activity.map((a) => a.message),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

function sortTasks(tasks: FollowUpTask[], sort: SortOption): FollowUpTask[] {
  const copy = [...tasks]
  switch (sort) {
    case 'priority_first':
      return copy.sort((a, b) => {
        const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        if (pd !== 0) return pd
        return new Date(`${a.dueDate}T${a.dueTime}`).getTime() - new Date(`${b.dueDate}T${b.dueTime}`).getTime()
      })
    case 'due_soon':
      return copy.sort(
        (a, b) =>
          new Date(`${a.dueDate}T${a.dueTime}`).getTime() - new Date(`${b.dueDate}T${b.dueTime}`).getTime(),
      )
    case 'newest':
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    case 'oldest':
      return copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    case 'recently_updated':
      return copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    default:
      return copy
  }
}

export function filterAndSortTasks(tasks: FollowUpTask[], filters: FollowUpFilters, now = new Date()): FollowUpTask[] {
  const result = tasks.filter((task) => {
    if (!matchesPriorityTab(task, filters.priorityTab)) return false
    if (filters.status !== 'all' && task.status !== filters.status) return false
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false
    if (filters.taskType !== 'all' && task.taskType !== filters.taskType) return false
    if (filters.assigned !== 'all' && task.assignedTeam !== filters.assigned) return false
    if (!matchesDueDateFilter(task, filters.dueDate, now)) return false
    if (filters.createdFromCall === 'yes' && !task.createdFromCall) return false
    if (filters.createdFromCall === 'no' && task.createdFromCall) return false
    if (!matchesSearch(task, filters.search)) return false
    return true
  })
  return sortTasks(result, filters.sort)
}

export function priorityBadgeVariant(priority: FollowUpPriority): 'destructive' | 'warning' | 'secondary' | 'outline' {
  if (priority === 'Urgent') return 'destructive'
  if (priority === 'High') return 'warning'
  if (priority === 'Medium') return 'warning'
  return 'secondary'
}

export function statusBadgeVariant(status: FollowUpStatus, overdue: boolean): 'destructive' | 'default' | 'success' | 'outline' | 'secondary' {
  if (overdue) return 'destructive'
  if (status === 'Completed') return 'success'
  if (status === 'Cancelled') return 'secondary'
  if (status === 'In Progress') return 'default'
  return 'outline'
}

export function displayStatus(task: FollowUpTask, now = new Date()): string {
  if (task.status !== 'Completed' && isTaskOverdue(task, now)) return 'Overdue'
  return task.status
}

export function computeSummaryMetrics(tasks: FollowUpTask[], now = new Date()) {
  const todayStr = now.toISOString().slice(0, 10)
  const open = tasks.filter((t) => !isTaskTerminal(t)).length
  const urgent = tasks.filter((t) => t.priority === 'Urgent' && !isTaskTerminal(t)).length
  const inProgress = tasks.filter((t) => t.status === 'In Progress').length
  const completedToday = tasks.filter((t) => t.status === 'Completed' && t.updatedAt.slice(0, 10) === todayStr).length
  const callbacks = tasks.filter((t) => t.taskType === 'Callback' && !isTaskTerminal(t)).length
  const pharmacistReview = tasks.filter(
    (t) => t.taskType === 'Pharmacist Review' && !isTaskTerminal(t),
  ).length
  return { open, urgent, inProgress, completedToday, callbacks, pharmacistReview }
}

export function computeAnalytics(tasks: FollowUpTask[], now = new Date()) {
  const openTasks = tasks.filter((t) => !isTaskTerminal(t))
  const completed = tasks.filter((t) => t.status === 'Completed').length
  const overdue = openTasks.filter((t) => isTaskOverdue(t, now)).length

  const byType: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  for (const t of openTasks) {
    byType[t.taskType] = (byType[t.taskType] ?? 0) + 1
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1
  }

  const ages = openTasks.map((t) => (now.getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  const avgAgeDays = ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : 0

  return { byType, byPriority, open: openTasks.length, completed, avgAgeDays, overdue }
}

export function createActivity(
  type: FollowUpActivity['type'],
  message: string,
  actor = 'Staff',
): FollowUpActivity {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
    actor,
  }
}

function sourceWorkflowForTaskType(taskType: FollowUpTaskType): SourceWorkflow {
  if (taskType === 'Insurance Issue') return 'Insurance Issue'
  if (taskType === 'Prior Authorization') return 'PA Follow-up'
  if (taskType === 'Delivery Issue') return 'Delivery Confirmation'
  if (taskType === 'Refill Request') return 'Refill Reminder'
  return 'Medication Adherence'
}

export function createTaskFromInput(input: CreateTaskInput): FollowUpTask {
  const now = new Date().toISOString()

  return {
    id: '',
    patientName: input.patientMasked,
    patientMasked: input.patientMasked,
    phoneMasked: input.phoneMasked,
    taskType: input.taskType,
    priority: input.priority,
    status: 'Open',
    sourceWorkflow: sourceWorkflowForTaskType(input.taskType),
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    assignedTeam: input.assignedTeam,
    issueSummary: input.issueSummary,
    staffNotes: input.notes?.trim() || undefined,
    aiRecommendedAction: 'Review task details and take appropriate follow-up action.',
    activity: [],
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

export const TASK_TYPES: FollowUpTaskType[] = [
  'Callback',
  'Pharmacist Review',
  'Insurance Issue',
  'Prior Authorization',
  'Delivery Issue',
  'No Answer',
  'Failed Call',
  'Medication Adherence',
  'Refill Request',
  'Invalid Row',
]

export const STATUS_OPTIONS: FollowUpStatus[] = ['Open', 'In Progress', 'Completed', 'Cancelled']

export const ASSIGNED_TEAMS: AssignedTeam[] = [
  'Unassigned',
  'Pharmacist',
  'Technician',
  'Billing Team',
  'Delivery Team',
  'Pharmacy Manager',
]

export const PRIORITIES: FollowUpPriority[] = ['Urgent', 'High', 'Medium', 'Low']

export function exportQueueJson(tasks: FollowUpTask[]) {
  const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), tasks }, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'follow-up-queue.json'
  link.click()
  URL.revokeObjectURL(url)
}
