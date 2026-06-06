import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const tasksRouter = Router()

tasksRouter.get('/tasks', async (_req, res) => {
  const tasks = await prisma.staffTask.findMany({ orderBy: { createdAt: 'desc' } }).catch(() => [])
  res.json(tasks)
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
