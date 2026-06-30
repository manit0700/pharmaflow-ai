# PharmaFlow AI

Pharmacy operations platform for outbound patient calls, AI-assisted conversations, call outcomes, staff follow-ups, analytics, integrations, and compliance-style monitoring.

The UI still contains demo/presentation surfaces, but the local app also includes a real Express API, Prisma persistence, Excel import/export, Twilio outbound calling, AI call mode, follow-up task creation, audit events, and analytics endpoints. It is not HIPAA-certified and must use fake patient data in development.

## Setup

### Frontend

```bash
cd pharmaflow-ai
npm install
cp .env.example .env.local
npm run dev
```

### Backend (Excel auto-call + Twilio)

```bash
cd server
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

API: http://localhost:4000/api/health  
Real mode UI: http://localhost:5173/calls?mode=real

Open the URL shown in the terminal (typically `http://localhost:5173`).

### Local AI outbound call setup

1. Start the local app:

```bash
cd pharmaflow-ai
npm run dev:pc
```

2. In another terminal, expose the local API to Twilio:

```bash
ngrok http 4002
```

3. Copy the active `https://...ngrok...` forwarding URL into ignored local config:

```json
{
  "DATABASE_URL": "postgresql://USER:PASSWORD@HOST:5432/DATABASE",
  "PUBLIC_BASE_URL": "https://YOUR-NGROK-HOST"
}
```

Use `server/local.config.json` or environment variables for local development. The current Prisma schema requires a `postgres://` or `postgresql://` database URL; SQLite `file:` URLs will run in stateless fallback and will not persist calls, transcripts, tasks, or audit events. Do not commit database URLs, ngrok URLs, or secrets.

4. Restart `npm run dev:pc` after changing `PUBLIC_BASE_URL`.

5. Verify callback readiness:

```bash
curl http://localhost:4002/api/health
```

The health response should show `callMode: "ai"`, `testMode: false`, `liveCallReadiness.ready: true`, and `callbacks.ready: true`.

6. Create a fake patient call job from the dashboard using a Twilio-verified destination number. Twilio trial accounts can only call verified numbers.

Troubleshooting:

- Call starts but dashboard does not update: the ngrok URL likely changed or `PUBLIC_BASE_URL` still points to production.
- Twilio callback returns 404: verify `{PUBLIC_BASE_URL}/api/twilio/voice-response` and `{PUBLIC_BASE_URL}/api/twilio/status` are reachable.
- Speech callback does not fire: confirm the call is in AI mode and the voice response route is using the current ngrok URL.
- Transcript remains empty: check API logs for `twilio_callback` diagnostics and verify callbacks are reaching the local API.
- Call is stuck in ringing/in-progress: wait for the final Twilio status callback, then refresh `/dashboard` or `/calls`.
- Twilio trial call fails: verify the destination number in Twilio Console or set `AUTO_CALL_TEST_MODE=true` for simulation.
- Production URL receives local callbacks: update `PUBLIC_BASE_URL` to the current ngrok URL and restart the API.

### Live demo (presentation mode)

1. Click **Start live demo** in the top bar (or **Live demo** in the header).
2. Or open with auto-play: `http://localhost:5173/workflows?demo=live`

While the demo runs:

- Simulated outbound calls appear in the **Live outbound feed** every few seconds.
- KPIs tick up on the dashboard.
- The workflow canvas runs a full **test execution** automatically (~every 22s).
- Toasts show connect / escalation events.

Click **Stop demo** when finished.

### Call recordings

- Open **Call Recordings** to play any outbound call.
- **Play recording** reads the transcript aloud (browser TTS) with a synced waveform scrubber.
- During live demo, each completed call auto-saves a new recording at the top of the list.
- **Export** downloads recording metadata + transcript JSON (demo — not a real `.wav` file).

```bash
npm run build   # production build
npm run preview # preview production build
```

## Tech stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- shadcn-style UI primitives (Radix)
- React Flow (`@xyflow/react`) — workflow canvas
- Recharts — analytics charts
- React Router — navigation
- Sonner — toasts
- Lucide — icons

## Features

| Area | Highlights |
|------|------------|
| **Dashboard** | KPIs, volume charts, queue health, escalations, recent runs & conversations |
| **Workflow Builder** | Drag-and-drop nodes, connections, minimap, test-run simulation, import/export JSON |
| **Conversations** | Voice/SMS transcripts, filters, entities, audit tab |
| **Integrations** | Twilio, OpenAI, ElevenLabs, PMS, Slack, etc. (mock status) |
| **Compliance** | Demo audit log, PHI/redaction cards, role mockup, retention toggles |
| **Analytics** | AI vs human, channel mix, trends, template usage |

**App-wide:** light/dark theme, ⌘K command palette, toast notifications, keyboard-friendly focus states.

## How this maps to pharmacy operations

Pharmacies handle high-volume, repetitive patient contact (refills, ready-for-pickup, hours, transfers) while clinical questions need a pharmacist. PharmaFlow AI models that split:

- **AI-routed / AI-completed** — intent detection, eligibility, FAQ, SMS confirmations, PMS updates (simulated).
- **Human-required** — escalations for clinical, insurance, or explicit pharmacist requests with queue assignment.

Workflow templates mirror common paths: refill automation, Rx status, FAQ/hours, missed-call SMS recovery, transfer intake, and escalation triage.

## Known limitations

- No real telephony, LLM, PMS, or HIPAA controls — UI demonstration only.
- Workflow state lives in browser memory (resets on refresh unless exported).
- Test runs use simulated delays and random failure/escalation for demo effect.

## Disclaimer

**This is a demo UI, not a real clinical or HIPAA-certified product.** Compliance screens use illustrative language (“HIPAA-oriented workflow controls”, “mock audit trail”) and must not be used for protected health information without a full compliance and security program.
