import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { appendTaskActivity, createAuditEvent } from '../services/followUpTasks.js'

export const tasksRouter = Router()

const taskInclude = {
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
  taskActivities: {
    orderBy: { createdAt: 'desc' as const },
    take: 30,
  },
}

type TaskPatchBody = {
  status?: string
  notes?: string
  appendNote?: string
  priority?: string
  assignedTeam?: string
  dueDate?: string
  dueTime?: string
  sourceWorkflow?: string
  issueSummary?: string
  activityJson?: string
  aiSummary?: string
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

function formatDueLabel(dueDate: string | null, dueTime: string | null): string {
  if (!dueDate) return 'not set'
  return `${dueDate}${dueTime ? ` at ${dueTime}` : ''}`
}

async function recordTaskPatchSideEffects(
  taskId: string,
  existing: {
    status: string
    priority: string
    assignedTeam: string
    dueDate: string | null
    dueTime: string
    notes: string | null
  },
  patch: TaskPatchBody,
) {
  const effects: Promise<unknown>[] = []

  if (patch.status !== undefined && patch.status !== existing.status) {
    const activityType =
      patch.status === 'completed' ? 'task_completed' : patch.status === 'cancelled' ? 'task_cancelled' : 'status_change'
    const auditAction =
      patch.status === 'completed'
        ? 'TASK_COMPLETED'
        : patch.status === 'cancelled'
          ? 'TASK_CANCELLED'
          : 'TASK_STATUS_UPDATED'
    const message =
      patch.status === 'completed'
        ? 'Task marked complete.'
        : patch.status === 'cancelled'
          ? 'Task cancelled.'
          : `Status changed from ${existing.status} to ${patch.status}.`

    effects.push(
      appendTaskActivity(taskId, activityType, message, {
        from: existing.status,
        to: patch.status,
      }),
      createAuditEvent('staff_task', taskId, auditAction, 'Follow-up task status updated.', {
        from: existing.status,
        to: patch.status,
      }),
    )
  }

  if (patch.assignedTeam !== undefined && patch.assignedTeam !== existing.assignedTeam) {
    effects.push(
      appendTaskActivity(
        taskId,
        'assignment_changed',
        `Assigned from ${existing.assignedTeam} to ${patch.assignedTeam}.`,
        { from: existing.assignedTeam, to: patch.assignedTeam },
      ),
      createAuditEvent('staff_task', taskId, 'TASK_ASSIGNED', 'Follow-up task assignment updated.', {
        from: existing.assignedTeam,
        to: patch.assignedTeam,
      }),
    )
  }

  if (patch.priority !== undefined && patch.priority !== existing.priority) {
    effects.push(
      appendTaskActivity(
        taskId,
        'priority_changed',
        `Priority changed from ${existing.priority} to ${patch.priority}.`,
        { from: existing.priority, to: patch.priority },
      ),
      createAuditEvent('staff_task', taskId, 'TASK_PRIORITY_UPDATED', 'Follow-up task priority updated.', {
        from: existing.priority,
        to: patch.priority,
      }),
    )
  }

  const dueChanged =
    (patch.dueDate !== undefined && patch.dueDate !== existing.dueDate) ||
    (patch.dueTime !== undefined && patch.dueTime !== existing.dueTime)

  if (dueChanged) {
    const nextDate = patch.dueDate !== undefined ? patch.dueDate : existing.dueDate
    const nextTime = patch.dueTime !== undefined ? patch.dueTime : existing.dueTime
    effects.push(
      appendTaskActivity(
        taskId,
        'due_date_changed',
        `Due date changed from ${formatDueLabel(existing.dueDate, existing.dueTime)} to ${formatDueLabel(nextDate, nextTime)}.`,
        {
          fromDate: existing.dueDate,
          fromTime: existing.dueTime,
          toDate: nextDate,
          toTime: nextTime,
        },
      ),
      createAuditEvent('staff_task', taskId, 'TASK_DUE_DATE_UPDATED', 'Follow-up task due date updated.', {
        fromDate: existing.dueDate,
        toDate: nextDate,
      }),
    )
  }

  if (patch.appendNote?.trim()) {
    effects.push(
      appendTaskActivity(taskId, 'note_added', 'Staff note added.', { hasNote: true }),
      createAuditEvent('staff_task', taskId, 'TASK_NOTE_ADDED', 'Staff note added to follow-up task.', {}),
    )
  } else if (patch.notes !== undefined && patch.notes !== existing.notes && patch.notes.trim()) {
    effects.push(
      appendTaskActivity(taskId, 'note_added', 'Staff notes updated.', { hasNote: true }),
      createAuditEvent('staff_task', taskId, 'TASK_NOTE_ADDED', 'Staff notes updated on follow-up task.', {}),
    )
  }

  await persistTaskSideEffects(effects)
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
      createAuditEvent('staff_task', task.id, 'TASK_CREATED', 'Follow-up task created.', {
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
    const body = req.body as TaskPatchBody
    const existingTask = await prisma.staffTask.findUnique({ where: { id: req.params.id } })
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' })
      return
    }

    const nextNotes = body.appendNote?.trim()
      ? [existingTask.notes, body.appendNote.trim()].filter(Boolean).join('\n')
      : body.notes !== undefined
        ? body.notes
        : existingTask.notes

    const nextStatus = body.status ?? existingTask.status
    const terminalStatus = nextStatus === 'completed' || nextStatus === 'cancelled'

    const task = await prisma.staffTask.update({
      where: { id: req.params.id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(nextNotes !== existingTask.notes && { notes: nextNotes }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.assignedTeam !== undefined && { assignedTeam: body.assignedTeam }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
        ...(body.dueTime !== undefined && { dueTime: body.dueTime }),
        ...(body.sourceWorkflow !== undefined && { sourceWorkflow: body.sourceWorkflow }),
        ...(body.issueSummary !== undefined && { issueSummary: body.issueSummary }),
        ...(body.activityJson !== undefined && { activityJson: body.activityJson }),
        ...(body.aiSummary !== undefined && { aiSummary: body.aiSummary }),
        ...(body.status === 'completed' && { completedAt: new Date() }),
        ...(body.status !== undefined && body.status !== 'completed' && existingTask.status === 'completed' && { completedAt: null }),
        ...(body.status === 'cancelled' && { completedAt: new Date() }),
        ...(body.status !== undefined && !terminalStatus && existingTask.status === 'cancelled' && { completedAt: null }),
      },
      include: taskInclude,
    })

    await recordTaskPatchSideEffects(existingTask.id, existingTask, {
      ...body,
      notes: nextNotes ?? undefined,
    })

    const updatedTask = await prisma.staffTask.findUnique({ where: { id: task.id }, include: taskInclude })
    res.json(updatedTask ?? task)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Update task failed'
    res.status(404).json({ error: message })
  }
})
