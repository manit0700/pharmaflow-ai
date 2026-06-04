import { createApp } from './app.js'
import { config } from './config.js'

const app = createApp()

app.listen(config.port, '0.0.0.0', () => {
  console.log(`PharmaFlow API listening on http://127.0.0.1:${config.port}`)
  console.log(`Health: http://localhost:${config.port}/api/health`)
  console.log('Routes: GET/POST /api/call-jobs, POST /api/call-jobs/:id/start-call')
})
