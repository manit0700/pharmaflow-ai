import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import { getTwilioClient } from '../lib/twilioAuth.js'

export const analyticsRouter = Router()

analyticsRouter.get('/analytics', async (req, res) => {
  const EMPTY = {
    totalJobs: 0, attempted: 0, completed: 0, escalated: 0, withPatientResponse: 0,
    todayCompleted: 0, todayTasksCreated: 0, todayTasksResolved: 0,
    voicemailCount: 0, noAnswerCount: 0, confirmationCount: 0,
    avgCallDurationSeconds: null as number | null,
    byReason: [], byStatus: [], series: [], aiVsHuman: [], channelMix: [], completionByReason: [],
  }

  try {
    const rawDays = Array.isArray(req.query.days) ? req.query.days[0] : req.query.days
    const days = rawDays ? Number(rawDays) : null
    const createdAtFilter =
      days && Number.isFinite(days) && days > 0
        ? { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
        : undefined
    const jobWhere = createdAtFilter ? { createdAt: createdAtFilter } : undefined
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [jobs, todayTasksCreatedCount, todayTasksResolvedCount] = await Promise.all([
      prisma.callJob.findMany({ where: jobWhere, orderBy: { createdAt: 'asc' } }),
      prisma.staffTask.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.staffTask.count({
        where: { status: { in: ['completed', 'Completed'] }, updatedAt: { gte: todayStart } },
      }),
    ])

    const byReason: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const byDay: Record<string, { date: string; calls: number; completed: number; escalations: number }> = {}

    let completed = 0
    let escalated = 0
    let withResponse = 0
    let attempted = 0
    let todayCompleted = 0
    let voicemailCount = 0
    let noAnswerCount = 0
    let confirmationCount = 0
    let totalDurationSeconds = 0
    let durationCount = 0

    for (const job of jobs) {
      byReason[job.callReason] = (byReason[job.callReason] ?? 0) + 1
      byStatus[job.callStatus] = (byStatus[job.callStatus] ?? 0) + 1

      if (job.callAttemptedAt) attempted++
      if (job.callStatus === 'completed') {
        completed++
        if (job.callCompletedAt && job.callCompletedAt >= todayStart) todayCompleted++
      }
      if (job.staffFollowUpNeeded || job.callStatus === 'escalated') escalated++
      if (job.patientResponse) withResponse++
      if (job.callStatus === 'voicemail') voicemailCount++
      if (job.callStatus === 'no_answer') noAnswerCount++
      if (
        job.patientResponse &&
        (job.patientResponse.toLowerCase().includes('confirmed') ||
          job.patientResponse.toLowerCase().includes('process today'))
      ) confirmationCount++

      if (job.callDuration && job.callDuration > 0) {
        totalDurationSeconds += job.callDuration
        durationCount++
      }

      const day = job.createdAt.toISOString().slice(0, 10)
      if (!byDay[day]) byDay[day] = { date: day, calls: 0, completed: 0, escalations: 0 }
      byDay[day].calls++
      if (job.callStatus === 'completed') byDay[day].completed++
      if (job.staffFollowUpNeeded) byDay[day].escalations++
    }

    const resolvedOnCall = Math.max(0, withResponse - escalated)
    const avgCallDurationSeconds = durationCount > 0 ? Math.round(totalDurationSeconds / durationCount) : null

    res.json({
      totalJobs: jobs.length,
      attempted,
      completed,
      escalated,
      withPatientResponse: withResponse,
      todayCompleted,
      todayTasksCreated: todayTasksCreatedCount,
      todayTasksResolved: todayTasksResolvedCount,
      voicemailCount,
      noAnswerCount,
      confirmationCount,
      avgCallDurationSeconds,
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
    res.json(EMPTY)
  }
})

async function buildDailySummaryData() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [jobs, openTasks, completedTasks] = await Promise.all([
    prisma.callJob.findMany({
      where: { callAttemptedAt: { gte: todayStart } },
      select: {
        callStatus: true,
        patientResponse: true,
        staffFollowUpNeeded: true,
        callDuration: true,
      },
    }),
    prisma.staffTask.count({ where: { status: 'open' } }),
    prisma.staffTask.count({
      where: { status: { in: ['completed', 'Completed'] }, updatedAt: { gte: todayStart } },
    }),
  ])

  const total = jobs.length
  const completed = jobs.filter((j) => j.callStatus === 'completed').length
  const voicemail = jobs.filter((j) => j.callStatus === 'voicemail').length
  const noAnswer = jobs.filter((j) => j.callStatus === 'no_answer').length
  const callbackRequested = jobs.filter((j) => j.callStatus === 'callback_requested').length
  const escalated = jobs.filter((j) => j.callStatus === 'escalated' || j.staffFollowUpNeeded).length
  const confirmations = jobs.filter((j) =>
    j.patientResponse && (j.patientResponse.toLowerCase().includes('confirmed') || j.patientResponse.toLowerCase().includes('process today'))
  ).length
  const durations = jobs.filter((j) => (j.callDuration ?? 0) > 0).map((j) => j.callDuration!)
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null

  return {
    date: todayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    total,
    completed,
    voicemail,
    noAnswer,
    callbackRequested,
    escalated,
    confirmations,
    avgDuration,
    openTasks,
    completedTasks,
  }
}

function buildSmsText(s: Awaited<ReturnType<typeof buildDailySummaryData>>): string {
  const lines = [
    `${config.pharmacyName} — Daily Summary (${s.date})`,
    `Calls today: ${s.total} total | ${s.completed} completed | ${s.voicemail} voicemail | ${s.callbackRequested} callback`,
    `Confirmations: ${s.confirmations} | Escalations: ${s.escalated}`,
    `Open staff tasks: ${s.openTasks} | Resolved today: ${s.completedTasks}`,
  ]
  if (s.avgDuration) lines.push(`Avg call duration: ${Math.floor(s.avgDuration / 60)}m ${s.avgDuration % 60}s`)
  return lines.join('\n')
}

analyticsRouter.get('/analytics/daily-summary', async (_req, res) => {
  try {
    const summary = await buildDailySummaryData()
    res.json({ summary, message: buildSmsText(summary) })
  } catch {
    res.status(500).json({ error: 'Could not build daily summary' })
  }
})

analyticsRouter.post('/analytics/daily-summary/send', async (_req, res) => {
  try {
    const summary = await buildDailySummaryData()
    const message = buildSmsText(summary)

    if (!config.staffPhone) {
      res.status(400).json({ error: 'No staff phone number configured in Settings.' })
      return
    }

    const client = getTwilioClient()
    const smsFrom = config.twilioSmsNumber || config.twilioPhoneNumber
    if (!client || !smsFrom) {
      res.status(400).json({ error: 'Twilio not configured for SMS.' })
      return
    }

    await client.messages.create({ to: config.staffPhone, from: smsFrom, body: message })
    res.json({ sent: true, to: config.staffPhone, summary, message })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to send summary' })
  }
})

analyticsRouter.get('/audit-events', async (_req, res) => {
  try {
    const [callEvents, staffTasks, recentJobs] = await Promise.all([
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

    const fromTasks = staffTasks.map((t) => ({
      id: t.id,
      timestamp: t.createdAt.toISOString(),
      actor: 'system',
      action: 'STAFF_TASK',
      resource: `task/${t.taskType}`,
      severity: t.priority === 'urgent' ? 'critical' : t.priority === 'high' ? 'warning' : 'info',
      details: `${t.patientName}: ${t.notes ?? t.taskType}`,
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

    const merged = [...fromTasks, ...fromJobs, ...fromEvents]
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
