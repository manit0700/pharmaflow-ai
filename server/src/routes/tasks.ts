import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const tasksRouter = Router()

tasksRouter.get('/tasks', async (_req, res) => {
  const tasks = await prisma.staffTask.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(tasks)
})

tasksRouter.post('/tasks', async (req, res) => {
  const body = req.body as Record<string, unknown>
  const task = await prisma.staffTask.create({
    data: {
      callJobId: body.callJobId ? String(body.callJobId) : null,
      patientName: String(body.patientName ?? 'Unknown patient'),
      phoneNumber: String(body.phoneNumber ?? ''),
      medicationName: body.medicationName ? String(body.medicationName) : null,
      taskType: String(body.taskType ?? 'follow_up'),
      priority: String(body.priority ?? 'normal'),
      status: String(body.status ?? 'open'),
      notes: body.notes != null ? String(body.notes) : null,
      aiSummary: body.aiSummary != null ? String(body.aiSummary) : null,
    },
  })
  res.status(201).json(task)
})

tasksRouter.patch('/tasks/:id', async (req, res) => {
  const { status, notes, priority } = req.body as {
    status?: string
    notes?: string
    priority?: string
  }
  const task = await prisma.staffTask.update({
    where: { id: req.params.id },
    data: {
      ...(status && { status }),
      ...(notes !== undefined && { notes }),
      ...(priority && { priority }),
    },
  })
  res.json(task)
})
