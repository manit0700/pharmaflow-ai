import express from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health.js'
import { importRouter } from './routes/import.js'
import { callJobsRouter } from './routes/callJobs.js'
import { tasksRouter } from './routes/tasks.js'
import { twilioRouter } from './routes/twilio.js'
import { ensureRuntimeDb, shouldInitializeRuntimeDb } from './lib/runtimeDb.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: true }))
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  if (shouldInitializeRuntimeDb()) {
    app.use(async (_req, _res, next) => {
      try {
        await ensureRuntimeDb()
        next()
      } catch (err) {
        next(err)
      }
    })
  }

  app.use('/api', healthRouter)
  app.use('/api', importRouter)
  app.use('/api', callJobsRouter)
  app.use('/api', tasksRouter)
  app.use('/api', twilioRouter)

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
