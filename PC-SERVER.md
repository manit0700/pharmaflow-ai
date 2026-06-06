# Run PharmaFlow on your PC (not Vercel)

Use a single config file on your Mac/PC instead of Vercel env vars or scattered `.env` files.

## 1. Create local config

```bash
cd ~/Projects/pharmaflow-ai
cp server/local.config.example.json server/local.config.json
```

Edit `server/local.config.json` with your Twilio and pharmacy settings (same keys as `server/.env.example`).

**Call mode** — set `CALL_MODE` to `dtmf` (keypad scripts, default) or `ai` (OpenAI speech). For AI mode, also set `OPENAI_API_KEY` and optionally `CALL_AI_MODEL`. See [CALL-SCRIPTS.md](./CALL-SCRIPTS.md).

**Call scripts:** `CALL_MODE` is `dtmf` (keypad menus, default) or `ai` (speech + OpenAI). See [CALL-SCRIPTS.md](./CALL-SCRIPTS.md). For AI mode set `OPENAI_API_KEY` and optionally `CALL_AI_MODEL`.

### Migrate from existing `.env`

If you already have `server/.env`:

```bash
node scripts/env-to-local-config.mjs
```

That writes `server/local.config.json` without printing secrets. After migration, the API prefers `local.config.json` over `.env`.

## 2. Start dev (API + UI)

```bash
npm run dev:pc
```

- API: `http://127.0.0.1:4002` (config from `local.config.json` when present)
- UI: Vite on `http://localhost:5173` — `/api` is proxied to the local API (no `VITE_API_BASE_URL` needed)

Check config source:

```bash
curl -s http://127.0.0.1:4002/api/health | jq .configSource
```

Expect `"local.config.json"` when the JSON file exists. Also check `callMode` and `liveCallReadiness`:

```bash
curl -s http://127.0.0.1:4002/api/health | jq '{callMode, aiCallConfigured, liveCallReadiness}'
```

Preview scripts locally:

```bash
npm run preview:scripts      # DTMF keypad flows
npm run preview:ai-prompt    # AI system prompts (when CALL_MODE=ai)
```


## 3. Twilio webhooks (ngrok, not Vercel)

Twilio must reach your machine for voice/status callbacks.

1. Set `PUBLIC_BASE_URL` in `server/local.config.json` to your ngrok HTTPS URL (not `https://pharmaflow-ai.vercel.app`).
2. Run a tunnel, e.g. `npm run ngrok:tunnel` (after `npm run ngrok:setup` if needed).
3. In Twilio Console, point voice/status webhooks to:
   - `https://<your-ngrok-host>/api/twilio/...` (paths your app exposes)

Restart the API after changing `PUBLIC_BASE_URL`.

## 4. Production-style run on the PC

Build and serve API + preview UI on your LAN:

```bash
npm run start:pc
```

API listens on `0.0.0.0:4002`; startup logs show a LAN URL when available.

## Fallback (CI / Vercel / no JSON file)

If `server/local.config.json` is missing, the server loads `server/.env` via dotenv (backward compatible). `configSource` in `/api/health` will be `"env"`.
