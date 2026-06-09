import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { buildOwnerAnalytics } from '../services/ownerAnalytics.js'

export const analyticsRouter = Router()

analyticsRouter.get('/analytics', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : '14d'
    const workflow = typeof req.query.workflow === 'string' ? req.query.workflow : undefined
    const data = await buildOwnerAnalytics({ range, workflow })
    res.json(data)
  } catch {
    res.json({
      generatedAt: new Date().toISOString(),
      range: '14d',
      workflowFilter: null,
      metrics: {
        totalCallJobs: 0,
        attemptedCalls: 0,
        completedCalls: 0,
        answeredCalls: 0,
        failedCalls: 0,
        noAnswerCalls: 0,
        voicemailCalls: 0,
        escalatedCalls: 0,
        callbackRequestedCalls: 0,
        followUpRequiredCalls: 0,
        openFollowUpTasks: 0,
        overdueFollowUpTasks: 0,
        completedFollowUpTasks: 0,
        cancelledFollowUpTasks: 0,
        averageCallDurationSeconds: null,
        averageAiConfidence: null,
        successRate: 0,
        answerRate: 0,
        followUpRate: 0,
        escalationRate: 0,
      },
      workflowBreakdown: [],
      taskMetrics: {
        tasksByStatus: [],
        tasksByPriority: [],
        tasksByType: [],
        tasksByAssignedTeam: [],
        urgentTasks: [],
        oldestOpenTasks: [],
        dueTodayTasks: 0,
        overdueTasks: 0,
      },
      trend: [],
      managerAttention: [],
    })
  }
})

analyticsRouter.get('/audit-events', async (_req, res) => {
  try {
    const [auditEvents, callEvents, staffTasks, recentJobs] = await Promise.all([
      prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 80 }).catch(() => []),
      prisma.callEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 80 }),
      prisma.staffTask.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
      prisma.callJob.findMany({
        where: { callAttemptedAt: { not: null } },
        orderBy: { callAttemptedAt: 'desc' },
        take: 30,
      }),
    ])

    const fromEvents = callEvents.map((e) => ({
      id: e.id,
      timestamp: e.createdAt.toISOString(),
      actor: 'system',
      action: e.eventType.replace(/^status_/, 'CALL_').toUpperCase(),
      resource: e.callJobId ? `call-job/${e.callJobId}` : `twilio/${e.twilioCallSid ?? 'unknown'}`,
      severity: e.eventType.includes('failed') ? 'warning' : 'info',
      details: e.eventType,
    }))

    const fromAuditEvents = auditEvents.map((e) => ({
      id: `audit-${e.id}`,
      timestamp: e.createdAt.toISOString(),
      actor: e.actor,
      action: e.action,
      resource: e.entityId ? `${e.entityType}/${e.entityId}` : e.entityType,
      severity: e.action.includes('FAILED') ? 'warning' : 'info',
      details: e.message,
    }))

    const fromTasks = staffTasks.map((t) => ({
      id: t.id,
      timestamp: t.createdAt.toISOString(),
      actor: 'system',
      action: 'STAFF_TASK',
      resource: `task/${t.taskType}`,
      severity: t.priority === 'urgent' ? 'critical' : t.priority === 'high' ? 'warning' : 'info',
      details: t.notes ?? t.taskType,
    }))

    const fromJobs = recentJobs.map((j) => ({
      id: `job-${j.id}`,
      timestamp: (j.callCompletedAt ?? j.callAttemptedAt ?? j.createdAt).toISOString(),
      actor: 'outbound',
      action: j.patientResponse ? 'CALL_RESOLVED' : 'CALL_ATTEMPTED',
      resource: `call-job/${j.id}`,
      severity: j.staffFollowUpNeeded ? 'warning' : 'info',
      details: j.patientResponse ?? j.aiSummary ?? `Status: ${j.callStatus}`,
    }))

    const merged = [...fromAuditEvents, ...fromTasks, ...fromJobs, ...fromEvents]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 100)

    res.json({
      events: merged,
      stats: {
        callEvents: callEvents.length,
        staffTasks: staffTasks.length,
        outboundCalls: recentJobs.length,
        followUpsNeeded: recentJobs.filter((j) => j.staffFollowUpNeeded).length,
      },
    })
  } catch {
    res.json({ events: [], stats: { callEvents: 0, staffTasks: 0, outboundCalls: 0, followUpsNeeded: 0 } })
  }
})
