# PharmaFlow AI

AI-powered outbound pharmacy call platform. Calls patients about prescription refills, verifies identity via DOB, handles yes/no responses, sends SMS follow-ups, creates staff tasks for escalations, and logs full transcripts.

**Production:**
- Frontend: https://pharmaflow-ai-amber.vercel.app
- Backend: https://ctezjgwgzy89sh5zx4am902w.fra.prisma.build
- Repo: https://github.com/PHPharmacy2023/pharmaflow-ai

## Tech stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/Radix UI
- **Backend:** Express.js + TypeScript (Node/Bun)
- **Database:** PostgreSQL via Prisma ORM
- **Hosting:** Vercel (frontend) + Prisma Compute (backend, eu-central-1)
- **Telephony:** Twilio (calls + SMS) / VAPI (AI voice)
- **AI:** OpenAI GPT-4o for conversation turns

## Local development

### Prerequisites

- Node.js 20+
- ngrok (for Twilio webhooks)
- A Twilio account with a verified number
- A PostgreSQL database (or Prisma Cloud DB)

### Setup

```bash
git clone https://github.com/PHPharmacy2023/pharmaflow-ai
cd pharmaflow-ai
npm install
cd server && npm install && cd ..
```

Create `server/local.config.json` (gitignored — never commit):

```json
{
  "DATABASE_URL": "postgresql://USER:PASSWORD@HOST:5432/DATABASE",
  "TWILIO_ACCOUNT_SID": "ACxxxx",
  "TWILIO_AUTH_TOKEN": "xxxx",
  "TWILIO_PHONE_NUMBER": "+1XXXXXXXXXX",
  "OPENAI_API_KEY": "sk-proj-xxxx",
  "PUBLIC_BASE_URL": "https://YOUR-NGROK-URL",
  "PHARMACY_NAME": "Your Pharmacy Name",
  "CALL_MODE": "ai",
  "ENABLE_SMS_FOLLOWUP": "true"
}
```

### Run locally

```bash
# Terminal 1 — expose API to Twilio
ngrok http 4002

# Copy the https URL into PUBLIC_BASE_URL in local.config.json, then:

# Terminal 2 — start API + frontend
npm run dev:all
```

- Frontend: http://localhost:5173
- API: http://localhost:4002/api/health

### Verify readiness

```bash
curl http://localhost:4002/api/health | python3 -m json.tool
```

Response should show `callMode: "ai"`, `testMode: false`, `liveCallReadiness.ready: true`.

## AI call flow

1. System dials patient via Twilio
2. AI greets and asks for date of birth (DOB verification)
3. On DOB match → AI names all pending prescriptions + asks to confirm refill
4. Patient says yes/no → call completes, SMS sent if enabled
5. Escalation (pharmacist request, failed DOB, ambiguous) → StaffTask created

## Deployment

### Backend (Prisma Compute)

```bash
npx @prisma/cli@latest app deploy --project proj_cmrkpv7030fbq3wdwo4kfrsop --prod --yes
```

### Frontend (Vercel)

```bash
npx vercel@latest deploy --prod
```

### Database schema

```bash
# Get one-time connection URL from Prisma Console, then:
DATABASE_URL="postgres://..." npx prisma db push
```

## Settings

Accessible at `/settings` in the UI. Configurable at runtime (no restart needed):

| Setting | Description |
|---------|-------------|
| Outbound caller ID | Twilio number shown to patients |
| Staff callback number | Escalation and SMS sender number |
| Pharmacy name | Used in call scripts and SMS messages |
| Call mode | `ai` (GPT-4o speech) or `dtmf` (keypad) |
| Voice / Language | Twilio Polly voice and language |
| SMS follow-up | Toggle post-call patient SMS |

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production |
| `manit` | manit0700 development |
| `shiv` | shivamk0311 development |

## Disclaimer

Not HIPAA-certified. Use only fake/test patient data in development. Do not commit credentials, `.env` files, ngrok URLs, or `local.config.json`.
