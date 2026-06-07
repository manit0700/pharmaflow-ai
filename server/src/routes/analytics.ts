import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const analyticsRouter = Router()

analyticsRouter.get('/analytics', async (_req, res) => {
  try {
    const jobs = await prisma.callJob.findMany({ orderBy: { createdAt: 'asc' } })

    const byReason: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const byDay: Record<string, { date: string; calls: number; completed: number; escalations: number }> = {}

    let completed = 0
    let escalated = 0
    let withResponse = 0
    let attempted = 0

    for (const job of jobs) {
      byReason[job.callReason] = (byReason[job.callReason] ?? 0) + 1
      byStatus[job.callStatus] = (byStatus[job.callStatus] ?? 0) + 1

      if (job.callAttemptedAt) attempted++
      if (job.callStatus === 'completed') completed++
      if (job.staffFollowUpNeeded || job.callStatus === 'escalated') escalated++
      if (job.patientResponse) withResponse++

      const day = job.createdAt.toISOString().slice(0, 10)
      if (!byDay[day]) {
        byDay[day] = { date: day, calls: 0, completed: 0, escalations: 0 }
      }
      byDay[day].calls++
      if (job.callStatus === 'completed') byDay[day].completed++
      if (job.staffFollowUpNeeded) byDay[day].escalations++
    }

    const resolvedOnCall = Math.max(0, withResponse - escalated)

    res.json({
      totalJobs: jobs.length,
      attempted,
      completed,
      escalated,
      withPatientResponse: withResponse,
      byReason: Object.entries(byReason).map(([reason, count]) => ({ reason, count })),
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      series: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      aiVsHuman: [
        { name: 'Resolved on call', value: resolvedOnCall, fill: '#22c55e' },
        { name: 'Staff follow-up', value: escalated, fill: '#f59e0b' },
        { name: 'No response yet', value: Math.max(0, attempted - withResponse), fill: '#94a3b8' },
      ],
      channelMix: [{ name: 'Voice', calls: attempted }],
      completionByReason: Object.entries(byReason).map(([reason, total]) => {
        const done = jobs.filter((j) => j.callReason === reason && j.patientResponse).length
        return { reason: reason.replace(/_/g, ' '), total, completed: done }
      }),
    })
  } catch {
    res.json({
      totalJobs: 0,
      attempted: 0,
      completed: 0,
      escalated: 0,
      withPatientResponse: 0,
      byReason: [],
      byStatus: [],
      series: [],
      aiVsHuman: [],
      channelMix: [],
      completionByReason: [],
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
