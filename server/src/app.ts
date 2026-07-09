import express from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health.js'
import { importRouter } from './routes/import.js'
import { callJobsRouter } from './routes/callJobs.js'
import { tasksRouter } from './routes/tasks.js'
import { twilioRouter } from './routes/twilio.js'
import { analyticsRouter } from './routes/analytics.js'
import { configRouter } from './routes/config.js'
import { campaignsRouter } from './routes/campaigns.js'
import { vapiRouter } from './routes/vapi.js'
import { ensureRuntimeDb, shouldInitializeRuntimeDb } from './lib/runtimeDb.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: true }))
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  if (shouldInitializeRuntimeDb()) {
    app.use(async (_req, _res, next) => {
      if (_req.path === '/api/health') {
        next()
        return
      }
      try {
        await ensureRuntimeDb()
      } catch (err) {
        console.error('Runtime DB unavailable; continuing with stateless Vercel fallback', err)
      }
      next()
    })
  }

  app.use('/api', healthRouter)
  app.use('/api', importRouter)
  app.use('/api', callJobsRouter)
  app.use('/api', tasksRouter)
  app.use('/api', twilioRouter)
  app.use('/api', analyticsRouter)
  app.use('/api', configRouter)
  app.use('/api', campaignsRouter)
  app.use('/api/vapi', vapiRouter)

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
