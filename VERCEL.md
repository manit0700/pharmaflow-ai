# Vercel Deployment

## What Vercel Should Host

Use Vercel for the React/Vite frontend.

This repo includes a Vercel `/api/*` Express function for demo deployment. It can run the existing backend on Vercel, but the current SQLite database uses Vercel's temporary function filesystem. That is not durable storage. Twilio status callbacks, call jobs, and staff tasks need managed Postgres before production use.

For production, move the backend to a managed Postgres database before relying on Vercel Functions for real patients.

## Environment Variables

Set this in the Vercel project:

```env
VITE_API_BASE_URL=https://pharmaflow-ai.vercel.app
PUBLIC_BASE_URL=https://pharmaflow-ai.vercel.app
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
TWILIO_ACCOUNT_SID=AC...          # office account (not SK)
TWILIO_API_KEY_SID=SK...          # office API key
TWILIO_API_KEY_SECRET=...         # API key secret
TWILIO_PHONE_NUMBER=+1...
AUTO_CALL_TEST_MODE=true
```

`PUBLIC_BASE_URL` must be the public HTTPS backend/API origin. On this combined Vercel deployment, the frontend and API share the same origin. Twilio calls:

```text
{PUBLIC_BASE_URL}/api/twilio/voice-response
{PUBLIC_BASE_URL}/api/twilio/status
{PUBLIC_BASE_URL}/api/twilio/inbound
```

## Deploy Frontend To Vercel

From repo root:

```bash
cd ~/Projects/pharmaflow-ai
vercel link
vercel env add VITE_API_BASE_URL production
vercel env add DATABASE_URL production
npm run db:migrate
vercel deploy --prod
```

When prompted for `VITE_API_BASE_URL` and `PUBLIC_BASE_URL`, enter the Vercel production URL, not localhost.
When prompted for `DATABASE_URL`, enter a managed Postgres connection string. Do not use `file:/tmp/pharmaflow.db` for real call jobs, Twilio callbacks, or follow-up tasks.

## If You Need Backend On Vercel

The backend is already exposed through Vercel Functions. Before production use, migrate the database from SQLite `/tmp` storage to managed Postgres. Without that migration, call jobs, Twilio callbacks, and staff tasks are not reliable.

Verify after deploy:

```bash
curl https://pharmaflow-ai.vercel.app/api/health
```

The response should show `"provider":"postgres"`, `"durable":true`, and `"connected":true`.
