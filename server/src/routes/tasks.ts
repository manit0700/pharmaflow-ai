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
  taskActivities: {
    orderBy: { createdAt: 'desc' as const },
    take: 10,
  },
}

function serializeMetadata(metadata: Record<string, unknown>): string {
  return JSON.stringify(metadata)
}

async function appendTaskActivity(
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

async function createAuditEvent(
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

async function persistTaskSideEffects(promises: Promise<unknown>[]) {
  const results = await Promise.allSettled(promises)
  for (const result of results) {
    if (result.status === 'rejected') {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
      console.warn('Task audit side effect failed', message)
    }
  }
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
        completedAt: String(body.status ?? 'open') === 'completed' ? new Date() : null,
      },
      include: taskInclude,
    })

    await persistTaskSideEffects([
      appendTaskActivity(task.id, 'task_created', `Task created for ${task.taskType}.`, {
        status: task.status,
        priority: task.priority,
        assignedTeam: task.assignedTeam,
        callJobId: task.callJobId,
      }),
      createAuditEvent('staff_task', task.id, 'TASK_CREATED', `Created follow-up task ${task.id}.`, {
        taskType: task.taskType,
        status: task.status,
      }),
    ])

    const createdTask = await prisma.staffTask.findUnique({ where: { id: task.id }, include: taskInclude })
    res.status(201).json(createdTask ?? task)
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
    const existingTask = await prisma.staffTask.findUnique({ where: { id: req.params.id } })
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' })
      return
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
        ...(status === 'completed' && { completedAt: new Date() }),
        ...(status && status !== 'completed' && existingTask.status === 'completed' && { completedAt: null }),
      },
      include: taskInclude,
    })

    const changedFields = [
      status !== undefined && status !== existingTask.status ? `status: ${existingTask.status} -> ${status}` : null,
      priority !== undefined && priority !== existingTask.priority ? `priority: ${existingTask.priority} -> ${priority}` : null,
      assignedTeam !== undefined && assignedTeam !== existingTask.assignedTeam
        ? `assigned team: ${existingTask.assignedTeam} -> ${assignedTeam}`
        : null,
      dueDate !== undefined && dueDate !== existingTask.dueDate ? `due date: ${existingTask.dueDate ?? 'none'} -> ${dueDate ?? 'none'}` : null,
      dueTime !== undefined && dueTime !== existingTask.dueTime ? `due time: ${existingTask.dueTime} -> ${dueTime}` : null,
    ].filter(Boolean)

    if (changedFields.length > 0) {
      await persistTaskSideEffects([
        appendTaskActivity(task.id, 'task_updated', `Updated ${changedFields.join(', ')}.`, {
          changes: changedFields,
        }),
        createAuditEvent('staff_task', task.id, 'TASK_UPDATED', `Updated follow-up task ${task.id}.`, {
          changedFields,
        }),
      ])
    } else {
      await persistTaskSideEffects([
        createAuditEvent('staff_task', task.id, 'TASK_UPDATED', `Updated follow-up task ${task.id}.`, {
          changedFields,
        }),
      ])
    }

    const updatedTask = await prisma.staffTask.findUnique({ where: { id: task.id }, include: taskInclude })
    res.json(updatedTask ?? task)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Update task failed'
    res.status(404).json({ error: message })
  }
})
