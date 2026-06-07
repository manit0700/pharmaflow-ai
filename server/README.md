# PharmaFlow AI — Backend

Express + Prisma + Twilio + Excel import for outbound pharmacy auto-calling. Local development can use SQLite; production should use durable Postgres through `DATABASE_URL`.

## Setup

```bash
cd server
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

API: http://localhost:4002/api/health

## Environment

See `.env.example`.

### Database

Use SQLite for local development:

```env
DATABASE_URL=file:./dev.db
```

Use managed Postgres for production:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

From the repo root or `server/` directory:

```bash
npm run db:check
npm run db:migrate
npm run db:seed   # optional fake demo data
```

`/api/health` reports the database provider, whether it is durable, and whether the connection succeeds.

### ngrok (real Twilio calls from localhost)

1. Sign up: https://dashboard.ngrok.com/signup  
2. Copy authtoken: https://dashboard.ngrok.com/get-started/your-authtoken  
3. In `server/.env`:
   ```env
   NGROK_AUTHTOKEN=your_token_here
   ```
4. From project root:
   ```bash
   npm run ngrok:setup    # saves token to ngrok CLI
   npm run ngrok:tunnel   # forwards https → localhost:4002
   ```
5. Copy the `https://….ngrok-free.app` URL into `server/.env`:
   ```env
   PUBLIC_BASE_URL=https://your-subdomain.ngrok-free.app
   AUTO_CALL_TEST_MODE=false
   ```
6. Restart API: `npm run dev:all`

Set `PUBLIC_BASE_URL` to your ngrok HTTPS URL. Configure Twilio voice webhooks:

- Inbound: `{PUBLIC_BASE_URL}/api/twilio/inbound`
- Status: `{PUBLIC_BASE_URL}/api/twilio/status`

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health + Twilio status |
| POST | `/api/import/excel` | Upload `.xlsx` (field: `file`) |
| GET | `/api/call-jobs` | List jobs |
| POST | `/api/call-jobs` | Add one patient (JSON body) |
| GET | `/api/call-jobs/export` | Download results Excel |
| GET | `/api/call-jobs/:id` | Job detail |
| POST | `/api/call-jobs/:id/start-call` | Start outbound call |
| POST | `/api/call-jobs/:id/retry` | Retry call |
| POST | `/api/twilio/status` | Twilio status webhook |
| POST | `/api/twilio/inbound` | Inbound voice webhook |
| POST | `/api/twilio/voice-response` | TwiML gather handler |
| GET | `/api/tasks` | Staff tasks |
| PATCH | `/api/tasks/:id` | Update task |

## Excel columns

`patient_name`, `phone_number`, `dob`, `medication_name`, `call_reason`, `notes`

**call_reason:** `refill_reminder`, `pickup_reminder`, `delivery_update`, `insurance_update`, `general_callback`

## Test mode

With `AUTO_CALL_TEST_MODE=true` and no Twilio credentials, `start-call` simulates completion without placing real calls.

## Safety

- No medication name before DOB verification in TwiML flow
- Voicemail/SMS use generic pharmacy message only
- Escalation keywords route to staff tasks
- Do not use real PHI in test spreadsheets
