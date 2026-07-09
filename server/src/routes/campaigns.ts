import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { runCall } from '../services/callExecution.js'

export const campaignsRouter = Router()

campaignsRouter.get('/campaigns', async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { patients: true } } },
  }).catch(() => [])
  res.json(campaigns.map((c) => ({ ...c, patientCount: c._count.patients })))
})

campaignsRouter.post('/campaigns', async (req, res) => {
  try {
    const name = String((req.body as Record<string, unknown>).name ?? '').trim()
    if (!name) { res.status(400).json({ error: 'Campaign name is required' }); return }
    const campaign = await prisma.campaign.create({ data: { name } })
    res.status(201).json(campaign)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create campaign failed' })
  }
})

campaignsRouter.get('/campaigns/:id', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      patients: {
        include: { callJob: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  res.json(campaign)
})

campaignsRouter.post('/campaigns/:id/patients', async (req, res) => {
  try {
    const callJobIds = Array.isArray((req.body as Record<string, unknown>).callJobIds)
      ? ((req.body as Record<string, unknown>).callJobIds as unknown[]).map(String).filter(Boolean)
      : []
    if (callJobIds.length === 0) { res.status(400).json({ error: 'callJobIds are required' }); return }

    await prisma.campaign.findUniqueOrThrow({ where: { id: req.params.id } })
    await prisma.$transaction(
      callJobIds.map((callJobId) =>
        prisma.campaignPatient.upsert({
          where: { campaignId_callJobId: { campaignId: req.params.id, callJobId } },
          update: {},
          create: { campaignId: req.params.id, callJobId },
        }),
      ),
    )
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { patients: { include: { callJob: true } } },
    })
    res.json(campaign)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Add campaign patients failed' })
  }
})

campaignsRouter.post('/campaigns/:id/start', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { patients: { include: { callJob: true } } },
    })
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

    await prisma.campaign.update({ where: { id: req.params.id }, data: { status: 'running' } })
    const results = await Promise.allSettled(campaign.patients.map((p) => runCall(p.callJob.id, p.callJob)))
    res.json({
      started: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Start campaign failed' })
  }
})

campaignsRouter.patch('/campaigns/:id', async (req, res) => {
  try {
    const status = String((req.body as Record<string, unknown>).status ?? '')
    if (!['draft', 'running', 'completed'].includes(status)) {
      res.status(400).json({ error: 'Invalid campaign status' })
      return
    }
    const campaign = await prisma.campaign.update({ where: { id: req.params.id }, data: { status } })
    res.json(campaign)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Update campaign failed' })
  }
})
