# PharmaFlow AI Deployment

## What `PUBLIC_BASE_URL` Should Be

`PUBLIC_BASE_URL` is the public HTTPS origin of the deployed API server.

Use the backend/API URL:

```env
PUBLIC_BASE_URL=https://pharmaflow-ai-api.onrender.com
```

Do not use:

```env
PUBLIC_BASE_URL=http://localhost:4002
PUBLIC_BASE_URL=https://pharmaflow-ai-web.onrender.com
PUBLIC_BASE_URL=https://pharmaflow-ai-api.onrender.com/api/twilio/status
```

The app adds webhook paths automatically:

```text
{PUBLIC_BASE_URL}/api/twilio/voice-response
{PUBLIC_BASE_URL}/api/twilio/status
{PUBLIC_BASE_URL}/api/twilio/inbound
```

## Render Deployment

This repo includes `render.yaml` for two services:

- `pharmaflow-ai-api`: Express + Prisma backend
- `pharmaflow-ai-web`: Vite static frontend

Render gives every web service an HTTPS `onrender.com` URL. For production call jobs, Twilio webhooks, and follow-up tasks, use managed Postgres through `DATABASE_URL`. SQLite is acceptable only for local development or throwaway demos.

## Steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Render will create `pharmaflow-ai-api` and `pharmaflow-ai-web`.
4. After the API service exists, copy its public URL. It will look like:

```text
https://pharmaflow-ai-api.onrender.com
```

5. Set API service environment variables:

```env
PUBLIC_BASE_URL=https://pharmaflow-ai-api.onrender.com
AUTO_CALL_TEST_MODE=false
ENABLE_SMS_FOLLOWUP=false
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1YOUR_TWILIO_NUMBER
PHARMACY_STAFF_PHONE_NUMBER=+1VERIFIED_STAFF_NUMBER
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

6. Set frontend service environment variables:

```env
VITE_API_BASE_URL=https://pharmaflow-ai-api.onrender.com
```

7. Redeploy both services.
8. Run the migration command against the same `DATABASE_URL`:

```bash
npm run db:migrate
```

Optional fake demo data:

```bash
npm run db:seed
```

8. Open:

```text
https://pharmaflow-ai-web.onrender.com/calls?mode=real
```

9. Check:

```text
https://pharmaflow-ai-api.onrender.com/api/health
```

`liveCallReadiness.ready` should be `true`.

The health response should also include:

```json
{
  "database": {
    "provider": "postgres",
    "durable": true,
    "connected": true
  }
}
```

## Twilio Console Settings

For inbound calls to your Twilio number, set the Voice webhook to:

```text
https://pharmaflow-ai-api.onrender.com/api/twilio/inbound
```

Outbound calls are created by the API and use:

```text
https://pharmaflow-ai-api.onrender.com/api/twilio/voice-response
https://pharmaflow-ai-api.onrender.com/api/twilio/status
```

## Twilio Trial Limit

With a Twilio trial account, real outbound calls only work to numbers you verify in Twilio Console first. If you call an unverified number, the app will save the Twilio trial error on the call job.

## Production Note

This deployment is suitable for a demo or limited internal test only after managed Postgres is connected. For real patient use, add authentication/authorization, formal audit log review, PHI-safe logging controls, encryption/key-management review, and confirm BAA coverage for Twilio and any AI vendor.
