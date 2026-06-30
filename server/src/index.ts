import './loadSettings.js'
import os from 'os'
import { createApp } from './app.js'
import { config } from './config.js'
import { markStaleActiveCalls, runDueBatchScheduledCalls, runDueScheduledRetries } from './services/retrySchedule.js'

const app = createApp()

function firstLanUrl(port: number): string | null {
  try {
    const nets = os.networkInterfaces()
    for (const ifaces of Object.values(nets)) {
      for (const net of ifaces ?? []) {
        if (net.family === 'IPv4' && !net.internal) {
          return `http://${net.address}:${port}`
        }
      }
    }
  } catch {
    /* ignore — optional hint only */
  }
  return null
}

app.listen(config.port, '0.0.0.0', () => {
  const lan = firstLanUrl(config.port)
  console.log(`PharmaFlow API listening on http://127.0.0.1:${config.port}`)
  if (lan) console.log(`LAN: ${lan} (other devices on your network)`)
  console.log(`Config: ${config.configSource}`)
  console.log(`Health: http://localhost:${config.port}/api/health`)
  console.log('Routes: GET/POST /api/call-jobs, POST /api/call-jobs/:id/start-call')
})

const schedulerIntervalMs = 30_000
setInterval(() => {
  void runDueBatchScheduledCalls().catch((err) => {
    console.error('[batch-scheduler] Failed', err instanceof Error ? err.message : err)
  })
  void runDueScheduledRetries().catch((err) => {
    console.error('[retry-scheduler] Failed', err instanceof Error ? err.message : err)
  })
}, schedulerIntervalMs)

setInterval(() => {
  void markStaleActiveCalls().catch((err) => {
    console.error('Stale call cleanup failed', err instanceof Error ? err.message : err)
  })
}, 60_000)
