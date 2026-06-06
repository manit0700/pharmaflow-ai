import './loadSettings.js'
import os from 'os'
import { createApp } from './app.js'
import { config } from './config.js'

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
