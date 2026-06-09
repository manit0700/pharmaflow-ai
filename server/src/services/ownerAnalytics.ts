import { prisma } from '../lib/prisma.js'
import { mapCallReasonToWorkflow } from './callOutcome.js'

export type AnalyticsRange = 'today' | '7d' | '14d' | '30d' | 'all'

const WORKFLOW_LABELS: Record<string, string> = {
  refill_reminder: 'Refill Reminder',
  pickup_reminder: 'Pickup Reminder',
  delivery_update: 'Delivery Update',
  insurance_update: 'Insurance Update',
  general_callback: 'General Callback',
}

const MEANINGFUL_RESPONSE_SKIP = new Set([
  'DOB verified',
  'DOB retry',
  'Voicemail',
  'Call ended before patient selected a response',
])

function workflowLabel(reason: string): string {
  return WORKFLOW_LABELS[reason] ?? mapCallReasonToWorkflow(reason)
}

function parseRange(range: string): { start: Date | null; trendDays: number } {
  const now = new Date()
  switch (range) {
    case 'today': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return { start, trendDays: 1 }
    }
    case '7d':
      return { start: new Date(now.getTime() - 7 * 86_400_000), trendDays: 7 }
    case '14d':
      return { start: new Date(now.getTime() - 14 * 86_400_000), trendDays: 14 }
    case '30d':
      return { start: new Date(now.getTime() - 30 * 86_400_000), trendDays: 14 }
    case 'all':
    default:
      return { start: null, trendDays: 14 }
  }
}

function inRange(date: Date, start: Date | null): boolean {
  return !start || date >= start
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

function isAnswered(patientResponse: string | null): boolean {
  if (!patientResponse?.trim()) return false
  return !MEANINGFUL_RESPONSE_SKIP.has(patientResponse.trim())
}

function isTaskOpen(status: string): boolean {
  return status === 'open' || status === 'in_progress'
}

function isTaskOverdue(dueDate: string | null, dueTime: string | null, status: string): boolean {
  if (!isTaskOpen(status) || !dueDate) return false
  const due = new Date(`${dueDate}T${dueTime ?? '23:59'}:00`)
  return due < new Date()
}

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false
  return dueDate === new Date().toISOString().slice(0, 10)
}

export type ManagerAttentionItem = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  actionLabel: string
  targetRoute: string
}

export async function buildOwnerAnalytics(params: { range?: string; workflow?: string }) {
  const rangeKey = (params.range ?? '14d') as AnalyticsRange
  const { start, trendDays } = parseRange(rangeKey)
  const workflowFilter = params.workflow?.trim() || null

  const [allJobs, allTasks] = await Promise.all([
    prisma.callJob.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        callReason: true,
        callStatus: true,
        callAttemptedAt: true,
        callCompletedAt: true,
        callDuration: true,
        patientResponse: true,
        staffFollowUpNeeded: true,
        aiConfidence: true,
        createdAt: true,
      },
    }),
    prisma.staffTask.findMany({
      select: {
        id: true,
        callJobId: true,
        taskType: true,
        priority: true,
        status: true,
        assignedTeam: true,
        dueDate: true,
        dueTime: true,
        patientName: true,
        issueSummary: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ])

  const jobs = allJobs.filter((j) => {
    if (!inRange(j.createdAt, start)) return false
    if (workflowFilter && j.callReason !== workflowFilter) return false
    return true
  })

  const jobIds = new Set(jobs.map((j) => j.id))
  const tasks = allTasks.filter((t) => {
    if (!inRange(t.createdAt, start)) return false
    if (workflowFilter && t.callJobId && !jobIds.has(t.callJobId)) return false
    if (workflowFilter && !t.callJobId) return false
    return true
  })

  const attempted = jobs.filter((j) => j.callAttemptedAt).length
  const completedCalls = jobs.filter((j) => j.callStatus === 'completed' || j.callStatus === 'resolved').length
  const answeredCalls = jobs.filter((j) => isAnswered(j.patientResponse)).length
  const failedCalls = jobs.filter((j) => j.callStatus === 'failed').length
  const noAnswerCalls = jobs.filter((j) => j.callStatus === 'no_answer').length
  const voicemailCalls = jobs.filter((j) => j.callStatus === 'voicemail').length
  const escalatedCalls = jobs.filter((j) => j.callStatus === 'escalated').length
  const callbackRequestedCalls = jobs.filter((j) => j.callStatus === 'callback_requested').length
  const followUpRequiredCalls = jobs.filter((j) => j.staffFollowUpNeeded).length

  const durations = jobs.map((j) => j.callDuration).filter((d): d is number => d != null && d > 0)
  const confidences = jobs.map((j) => j.aiConfidence).filter((c): c is number => c != null)
  const averageCallDurationSeconds =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null
  const averageAiConfidence =
    confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : null

  const openFollowUpTasks = tasks.filter((t) => isTaskOpen(t.status)).length
  const overdueFollowUpTasks = tasks.filter((t) => isTaskOverdue(t.dueDate, t.dueTime, t.status)).length
  const completedFollowUpTasks = tasks.filter((t) => t.status === 'completed').length
  const cancelledFollowUpTasks = tasks.filter((t) => t.status === 'cancelled').length
  const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && isTaskOpen(t.status))
  const dueTodayTasks = tasks.filter((t) => isDueToday(t.dueDate) && isTaskOpen(t.status))
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t.dueDate, t.dueTime, t.status))

  const tasksByStatus: Record<string, number> = {}
  const tasksByPriority: Record<string, number> = {}
  const tasksByType: Record<string, number> = {}
  const tasksByAssignedTeam: Record<string, number> = {}

  for (const t of tasks) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1
    tasksByPriority[t.priority] = (tasksByPriority[t.priority] ?? 0) + 1
    tasksByType[t.taskType] = (tasksByType[t.taskType] ?? 0) + 1
    tasksByAssignedTeam[t.assignedTeam] = (tasksByAssignedTeam[t.assignedTeam] ?? 0) + 1
  }

  const workflowMap = new Map<
    string,
    {
      workflow: string
      callReason: string
      total: number
      completed: number
      noAnswer: number
      failed: number
      followUpsCreated: number
      durationSum: number
      durationCount: number
    }
  >()

  for (const j of jobs) {
    const key = j.callReason
    if (!workflowMap.has(key)) {
      workflowMap.set(key, {
        workflow: workflowLabel(key),
        callReason: key,
        total: 0,
        completed: 0,
        noAnswer: 0,
        failed: 0,
        followUpsCreated: 0,
        durationSum: 0,
        durationCount: 0,
      })
    }
    const row = workflowMap.get(key)!
    row.total++
    if (j.callStatus === 'completed' || j.callStatus === 'resolved') row.completed++
    if (j.callStatus === 'no_answer') row.noAnswer++
    if (j.callStatus === 'failed') row.failed++
    if (j.callDuration && j.callDuration > 0) {
      row.durationSum += j.callDuration
      row.durationCount++
    }
  }

  for (const t of tasks) {
    if (!t.callJobId) continue
    const job = jobs.find((j) => j.id === t.callJobId)
    if (!job) continue
    const row = workflowMap.get(job.callReason)
    if (row) row.followUpsCreated++
  }

  const workflowBreakdown = [...workflowMap.values()]
    .map((w) => ({
      workflow: w.workflow,
      callReason: w.callReason,
      total: w.total,
      completed: w.completed,
      noAnswer: w.noAnswer,
      failed: w.failed,
      followUpsCreated: w.followUpsCreated,
      successRate: pct(w.completed, w.total),
      averageDurationSeconds:
        w.durationCount > 0 ? Math.round(w.durationSum / w.durationCount) : null,
    }))
    .sort((a, b) => b.total - a.total)

  const trendStart = new Date()
  trendStart.setDate(trendStart.getDate() - (trendDays - 1))
  trendStart.setHours(0, 0, 0, 0)

  const trendMap = new Map<string, { date: string; calls: number; completed: number; failed: number; followUps: number; tasksCompleted: number }>()
  for (let i = 0; i < trendDays; i++) {
    const d = new Date(trendStart)
    d.setDate(trendStart.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    trendMap.set(key, { date: key, calls: 0, completed: 0, failed: 0, followUps: 0, tasksCompleted: 0 })
  }

  for (const j of allJobs) {
    const day = j.createdAt.toISOString().slice(0, 10)
    const bucket = trendMap.get(day)
    if (!bucket) continue
    if (workflowFilter && j.callReason !== workflowFilter) continue
    bucket.calls++
    if (j.callStatus === 'completed' || j.callStatus === 'resolved') bucket.completed++
    if (j.callStatus === 'failed' || j.callStatus === 'no_answer') bucket.failed++
  }

  for (const t of allTasks) {
    const day = t.createdAt.toISOString().slice(0, 10)
    const bucket = trendMap.get(day)
    if (bucket) bucket.followUps++
    if (t.status === 'completed' && t.updatedAt) {
      const doneDay = t.updatedAt.toISOString().slice(0, 10)
      const doneBucket = trendMap.get(doneDay)
      if (doneBucket) doneBucket.tasksCompleted++
    }
  }

  const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  const oldestOpenTasks = tasks
    .filter((t) => isTaskOpen(t.status))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      taskType: t.taskType,
      priority: t.priority,
      status: t.status,
      assignedTeam: t.assignedTeam,
      issueSummary: t.issueSummary ?? 'Follow-up required',
      ageDays: Math.max(0, Math.round((Date.now() - t.createdAt.getTime()) / 86_400_000)),
      dueDate: t.dueDate,
    }))

  const urgentTaskRows = urgentTasks.slice(0, 8).map((t) => ({
    id: t.id,
    taskType: t.taskType,
    priority: t.priority,
    assignedTeam: t.assignedTeam,
    issueSummary: t.issueSummary ?? 'Urgent follow-up',
    dueDate: t.dueDate,
  }))

  const managerAttention: ManagerAttentionItem[] = []

  if (noAnswerCalls > 0) {
    managerAttention.push({
      id: 'no-answer-retry',
      severity: noAnswerCalls >= 5 ? 'critical' : 'warning',
      title: `${noAnswerCalls} no-answer call${noAnswerCalls === 1 ? '' : 's'} need retry`,
      description: 'Patients did not pick up. Review call queue and schedule retries.',
      actionLabel: 'View calls',
      targetRoute: '/calls',
    })
  }

  if (urgentTasks.length > 0) {
    managerAttention.push({
      id: 'urgent-tasks',
      severity: 'critical',
      title: `${urgentTasks.length} urgent task${urgentTasks.length === 1 ? '' : 's'} open`,
      description: 'Pharmacist review or high-priority follow-ups need immediate attention.',
      actionLabel: 'View follow-ups',
      targetRoute: '/follow-ups?tab=urgent',
    })
  }

  if (overdueFollowUpTasks > 0) {
    managerAttention.push({
      id: 'overdue-tasks',
      severity: overdueFollowUpTasks >= 3 ? 'critical' : 'warning',
      title: `${overdueFollowUpTasks} overdue follow-up task${overdueFollowUpTasks === 1 ? '' : 's'}`,
      description: 'Tasks are past due. Reassign or reschedule to keep patients on track.',
      actionLabel: 'View overdue',
      targetRoute: '/follow-ups',
    })
  }

  if (failedCalls > 0) {
    managerAttention.push({
      id: 'failed-calls',
      severity: 'warning',
      title: `${failedCalls} failed call${failedCalls === 1 ? '' : 's'}`,
      description: 'Check phone numbers and Twilio configuration for failed outbound attempts.',
      actionLabel: 'Review calls',
      targetRoute: '/calls',
    })
  }

  for (const w of workflowBreakdown) {
    if (w.total >= 3 && w.successRate < 40) {
      managerAttention.push({
        id: `low-success-${w.callReason}`,
        severity: 'warning',
        title: `${w.workflow} has low completion rate`,
        description: `${w.successRate}% completion across ${w.total} calls in this period.`,
        actionLabel: 'View analytics',
        targetRoute: `/analytics?workflow=${w.callReason}`,
      })
      break
    }
  }

  if (followUpRequiredCalls > openFollowUpTasks && followUpRequiredCalls > 0) {
    managerAttention.push({
      id: 'missing-tasks',
      severity: 'info',
      title: 'Calls need follow-up task coverage',
      description: `${followUpRequiredCalls - openFollowUpTasks} call outcomes may still need staff tasks.`,
      actionLabel: 'Open follow-ups',
      targetRoute: '/follow-ups',
    })
  }

  if (dueTodayTasks.length > 0) {
    managerAttention.push({
      id: 'due-today',
      severity: 'info',
      title: `${dueTodayTasks.length} task${dueTodayTasks.length === 1 ? '' : 's'} due today`,
      description: 'Staff should complete or reschedule callbacks scheduled for today.',
      actionLabel: 'View follow-ups',
      targetRoute: '/follow-ups',
    })
  }

  if (managerAttention.length === 0 && jobs.length === 0) {
    managerAttention.push({
      id: 'no-data',
      severity: 'info',
      title: 'No call activity in this period',
      description: 'Import patients or place outbound calls to populate owner analytics.',
      actionLabel: 'Go to dashboard',
      targetRoute: '/dashboard',
    })
  }

  const metrics = {
    totalCallJobs: jobs.length,
    attemptedCalls: attempted,
    completedCalls,
    answeredCalls,
    failedCalls,
    noAnswerCalls,
    voicemailCalls,
    escalatedCalls,
    callbackRequestedCalls,
    followUpRequiredCalls,
    openFollowUpTasks,
    overdueFollowUpTasks,
    completedFollowUpTasks,
    cancelledFollowUpTasks,
    averageCallDurationSeconds,
    averageAiConfidence,
    successRate: pct(completedCalls, attempted || jobs.length),
    answerRate: pct(answeredCalls, attempted || jobs.length),
    followUpRate: pct(followUpRequiredCalls, attempted || jobs.length),
    escalationRate: pct(escalatedCalls, attempted || jobs.length),
  }

  return {
    generatedAt: new Date().toISOString(),
    range: rangeKey,
    workflowFilter,
    metrics,
    workflowBreakdown,
    taskMetrics: {
      tasksByStatus: Object.entries(tasksByStatus).map(([key, count]) => ({ key, count })),
      tasksByPriority: Object.entries(tasksByPriority).map(([key, count]) => ({ key, count })),
      tasksByType: Object.entries(tasksByType).map(([key, count]) => ({ key, count })),
      tasksByAssignedTeam: Object.entries(tasksByAssignedTeam).map(([key, count]) => ({ key, count })),
      urgentTasks: urgentTaskRows,
      oldestOpenTasks,
      dueTodayTasks: dueTodayTasks.length,
      overdueTasks: overdueTasks.length,
    },
    trend,
    managerAttention,
  }
}
