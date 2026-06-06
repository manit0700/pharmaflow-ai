# Call scripts — DTMF and AI modes

PharmaFlow supports two outbound call modes, selected with `CALL_MODE` in `server/local.config.json` (or `server/.env`).

| Mode | Value | Patient interaction | Stored result |
|------|-------|---------------------|---------------|
| **DTMF** (default) | `dtmf` | Keypad: greeting → DOB → menu | `patientResponse` from script catalog |
| **AI** | `ai` | Speech + OpenAI per turn | `patientResponse` + `aiSummary` from model JSON |

Check active mode: `GET /api/health` → `callMode`, `aiCallConfigured`.

## DTMF mode (`CALL_MODE=dtmf`)

Script definitions live in `server/src/services/callScripts.ts`. Each call reason has:

1. **Greeting** — pharmacy + patient name
2. **DOB prompt** — patient enters 4 digits (MMDD)
3. **Main menu** — patient presses one key
4. **Closing** — confirmation message; may transfer or flag callback

Canonical answers are stored on `CallJob.patientResponse` (e.g. `Confirmed refill — process today`).

### Preview scripts locally

```bash
npm run preview:scripts
```

Builds the server, then prints every call-reason script with sample patient/medication context.

### Twilio flow

```
Outbound call → greeting (TTS + gather 4 digits)
             → DOB verify against CallJob.dob
             → main menu (TTS + gather 1 digit)
             → resolve digit → store patientResponse → closing / transfer
```

Voicemail is left if the call goes to machine detection.

## AI mode (`CALL_MODE=ai`)

Requires `OPENAI_API_KEY`. Optional `CALL_AI_MODEL` (default `gpt-4o-mini`).

Each turn:

1. Twilio **speech gather** sends `SpeechResult` to the server
2. Server calls OpenAI with a pharmacy-safe system prompt for the call reason
3. Model returns JSON:

```json
{
  "spoken": "What the caller hears next",
  "patientResponse": "Canonical staff label or null while verifying",
  "action": "complete | transfer | callback | continue",
  "summary": "One-line staff log"
}
```

4. Server stores `messagesJson`, `patientResponse`, `aiSummary` on `CallJob`
5. `action=continue` → another speech gather; terminal actions hang up or dial staff

Escalation keywords (side effects, emergencies, etc.) can force `transfer` even when the model says `continue`.

### Preview AI prompts

```bash
npm run preview:ai-prompt
```

Prints the system prompt for each call reason (no API call, no secrets).

## Configuration

Add to `server/local.config.json` (see `server/local.config.example.json`):

```json
{
  "CALL_MODE": "dtmf",
  "OPENAI_API_KEY": "",
  "CALL_AI_MODEL": "gpt-4o-mini"
}
```

- `CALL_MODE`: `dtmf` (default) or `ai`
- `OPENAI_API_KEY`: required when `CALL_MODE=ai`
- `CALL_AI_MODEL`: optional OpenAI chat model

## Call reasons

| Reason | DTMF menu keys | Example patientResponse |
|--------|----------------|-------------------------|
| `refill_reminder` | 1 process, 2 not ready, 3 already picked up, 0 staff | `Confirmed refill — process today` |
| `pickup_reminder` | 1 today, 2 more time, 3 picked up, 0 staff | `Will pick up today` |
| `delivery_update` | 1 available, 2 reschedule, 3 received, 0 staff | `Available for delivery today` |
| `insurance_update` | 1 talk now, 2 callback, 0 staff | `Requested insurance callback` |
| `general_callback` | 1 talk, 2 callback, 3 resolved, 0 staff | `Issue already resolved` |

## Test mode

With `AUTO_CALL_TEST_MODE=true`, calls are simulated without Twilio. Test `patientResponse` uses the first DTMF option for the job's call reason (or an AI simulation label when `CALL_MODE=ai`).

## Related files

- `server/src/services/callScripts.ts` — DTMF script catalog
- `server/src/services/callAi.ts` — OpenAI prompts and turn handling
- `server/src/services/twilioFlow.ts` — TwiML builders for both modes
- `server/src/routes/twilio.ts` — webhook handler (greeting → DOB/menu or AI turns)
