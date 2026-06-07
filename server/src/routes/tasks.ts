import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const tasksRouter = Router()

const taskInclude = {
  callJob: {
    select: {
      id: true,
      callReason: true,
      patientResponse: true,
      callCompletedAt: true,
      callAttemptedAt: true,
      followUpReason: true,
    },
  },
}

tasksRouter.get('/tasks', async (_req, res) => {
  const tasks = await prisma.staffTask
    .findMany({ orderBy: { createdAt: 'desc' }, include: taskInclude })
    .catch(() => [])
  res.json(tasks)
})

tasksRouter.post('/tasks', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const task = await prisma.staffTask.create({
      data: {
        patientName: String(body.patientName ?? 'Demo Patient'),
        phoneNumber: String(body.phoneNumber ?? '(***) ***-0000'),
        medicationName: body.medicationName != null ? String(body.medicationName) : null,
        taskType: String(body.taskType ?? 'follow_up'),
        priority: String(body.priority ?? 'normal'),
        status: String(body.status ?? 'open'),
        notes: body.notes != null ? String(body.notes) : null,
        aiSummary: body.aiSummary != null ? String(body.aiSummary) : null,
        callJobId: body.callJobId != null ? String(body.callJobId) : null,
        assignedTeam: String(body.assignedTeam ?? 'Unassigned'),
        dueDate: body.dueDate != null ? String(body.dueDate) : null,
        dueTime: String(body.dueTime ?? '15:00'),
        sourceWorkflow: body.sourceWorkflow != null ? String(body.sourceWorkflow) : null,
        issueSummary: body.issueSummary != null ? String(body.issueSummary) : null,
        activityJson: body.activityJson != null ? String(body.activityJson) : null,
      },
      include: taskInclude,
    })
    res.status(201).json(task)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Create task failed'
    res.status(500).json({ error: message })
  }
})

tasksRouter.patch('/tasks/:id', async (req, res) => {
  try {
    const { status, notes, priority, assignedTeam, dueDate, dueTime, sourceWorkflow, issueSummary, activityJson, aiSummary } =
      req.body as {
        status?: string
        notes?: string
        priority?: string
        assignedTeam?: string
        dueDate?: string
        dueTime?: string
        sourceWorkflow?: string
        issueSummary?: string
        activityJson?: string
        aiSummary?: string
      }
    const task = await prisma.staffTask.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(priority && { priority }),
        ...(assignedTeam && { assignedTeam }),
        ...(dueDate !== undefined && { dueDate }),
        ...(dueTime && { dueTime }),
        ...(sourceWorkflow !== undefined && { sourceWorkflow }),
        ...(issueSummary !== undefined && { issueSummary }),
        ...(activityJson !== undefined && { activityJson }),
        ...(aiSummary !== undefined && { aiSummary }),
      },
      include: taskInclude,
    })
    res.json(task)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Update task failed'
    res.status(404).json({ error: message })
  }
})
