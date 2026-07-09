# PharmaFlow AI — Claude Handoff

Use this file instead of loading long chat history. Read it first every session.

## Project

- Repo: `/Users/manitdankhara/Projects/pharmaflow-ai`
- Frontend: `http://localhost:5173`
- API: `http://localhost:4002`
- Health: `http://localhost:4002/api/health`
- Local config: `server/local.config.json` (gitignored — never commit)
- Pharmacy name: `Premium Family Pharmacy` (set in `server/local.config.json` as `PHARMACY_NAME`)

## Rules

- Never expose or print secrets.
- Never commit `.env`, `.env.vercel.production`, `server/local.config.json`, `node_modules`, `dist`, credentials, or ngrok URLs.
- Do not change caller ID to the `7508` number unless Twilio shows it as `owned_number` or `verified_caller_id` (check `GET /api/config/caller-id-status`).
- Do not add unrelated features.
- Keep changes focused and small.
- Always run `npm run lint && npm run build --prefix server && npm run build` before reporting done.

## Architecture

```
Frontend (Vite/React)  →  Vite proxy  →  Express API (port 4002)
                                               ↓
                                         Twilio (calls + SMS out)
                                         OpenAI gpt-4o (AI turns)
                                         Prisma / PostgreSQL (Prisma Cloud)
```

**PhoneProvider abstraction:**
- `server/src/services/phoneProvider.ts` — wraps Twilio as `PhoneProvider`
- `displayName = "PharmaFlow Calling"` (shown in UI)
- `carrierName = "Twilio"` (hidden from users)
- Caller ID from number: `+16822415143` (verified owned number)

## Verified Working State (as of last session)

- `callMode = ai`, `testMode = false`, `aiCallConfigured = true`, model = `gpt-4o`
- `liveCallReadiness.ready = true` (ngrok running)
- Twilio account: Full (not trial), status active
- Caller ID `+16822415143` verified as `owned_number`
- `npm run lint` ✅  `npm run build --prefix server` ✅  `npm run build` ✅

## AI Outbound Call Flow (current)

```
1. Call placed → Twilio dials → patient answers
   → POST /api/twilio/voice-response?step=ai_greeting
   AI says: "This is Premium Family Pharmacy. To verify your identity, could you
             please tell me your date of birth?"
   <Say> is OUTSIDE <Gather> so Twilio only starts listening after AI finishes speaking.

2. Patient speaks DOB (e.g. "zero one zero one" = 0101)
   speechTimeout = 2s (submit after 2s silence)
   Accepted formats: "0101", "01 01", "January first", "zero one zero one",
                     full date "January first nineteen eighty"
   ✓ Match → AI IMMEDIATELY continues in SAME response:
             "Thank you. Your prescriptions for [all meds] are ready. [Total: $X.]
              Would you like us to process all of them today?"
   ✗ No match → AI echoes back what it heard: "I heard January second — is that correct?
                 If not, please say your date of birth again."
   DOB gate: 3 failed attempts → escalate

3. Patient responds
   YES → action=complete, patientResponse="Confirmed refill — process today"
   NO  → action=complete, patientResponse="Not ready for refill yet"
   Ambiguous → AI re-asks: "Just to confirm — would you like us to process the
               refill today? Please say yes or no."
   Max 8 AI turns total → escalate if unresolved

4. On complete → SMS follow-up sent (if ENABLE_SMS_FOLLOWUP=true)
   smsStatus updated to 'sent' or 'failed' on CallJob
```

**YES phrases accepted (30+):** yes, yeah, yep, yup, yah, sure, okay, ok, alright, please, yes please, please do, go ahead, go for it, do it, let's do it, process it, refill it, sounds good, of course, absolutely, definitely, certainly, for sure, correct, right, affirmative, I'd like that, please process

**NO phrases accepted (20+):** no, nope, nah, no thanks, not yet, not now, not today, not right now, don't need it, I'm good, I'm fine, maybe later, later, skip it, already got it, already picked it up, I have enough, negative, not interested, don't bother, hold off

**Multiple prescriptions:** AI names ALL of them, asks ONE question covering all, one yes/no resolves all.

## Call Recording (wired)

- `calls.create()` has `record: true` — every call is recorded by Twilio
- Recording webhook: `POST /api/twilio/recording-status` → saves `.mp3` URL to `CallJob.recordingUrl`
- Audio proxy: `GET /api/call-jobs/:id/recording/audio` — proxies Twilio audio with auth (credentials never sent to browser)
- Conversations page: shows green "Twilio recording available" badge and uses real `<audio>` element when URL is present; falls back to transcript voice-replay otherwise

## SMS Follow-Up (wired)

- Triggered: after every `action=complete` call turn in `handleAiVoiceResponse`
- Service: `server/src/services/sms.ts` → `sendSmsFollowUp()`
- Enabled by: `ENABLE_SMS_FOLLOWUP=true` in `server/local.config.json`
- Message: "Hi [FirstName], this is Premium Family Pharmacy. Your refill for [med(s)] has been confirmed and is being processed. It will be ready for pickup shortly."
- `smsStatus` on `CallJob`: `'none'` → `'sent'` or `'failed'`
- Uses same Twilio number as outbound calls (`twilioPhoneNumber`)

## DOB Verification Rules (AI prompt)

- DOB on file passed to AI as `patientDob` in `ScriptContext`
- AI accepts MMDD, MM/DD, spoken month+day, full date (year optional)
- On verification turn: AI MUST combine DOB confirmation + prescription question in same response
- On wrong DOB: echo back what was heard, ask patient to confirm or retry
- `dobVerified: true` in AI JSON response → `__DOB_VERIFIED__` sentinel injected into `messagesJson`

## Caller ID Validation (Settings page)

- `GET /api/config/caller-id-status?number=+1XXXXXXXXXX`
- Returns `{ usable: bool, type: "owned_number"|"verified_caller_id"|"not_found"|"unknown", message }`
- Settings page auto-checks on load/save and has "Check caller ID" button
- The `+17508...` business number shows `not_found` until purchased or verified in Twilio

## AMD / Machine Detection

- `machineDetection: 'Enable'` + `machineDetectionTimeout: 30` set in `calls.create()`
- Twilio includes `AnsweredBy` in the voice-response POST body
- `AnsweredBy = human` → `callStatus = in_progress`, call proceeds normally
- `AnsweredBy = machine_start | machine_end_* | fax` → play voicemail TwiML, hang up, `callStatus = voicemail`
- Speech-based IVR detection (< 3 AI turns) also catches missed cases

## No-Goodbye Protection (two layers)

1. **`callAi.ts`**: `stripFarewells()` + `FAREWELL_NUCLEAR_RE` on AI-generated text
2. **`twilioFlow.ts`**: `sanitizeSpokenText()` + `FAREWELL_WORD_RE` before every `<Say>` element
3. Terminal closings use hardcoded safe phrases only — never AI-generated

## Speech Sensitivity

- `speechModel: 'phone_call'`, `enhanced: true` on all `<Gather>` elements
- Confidence threshold: 0.50 — speech below this is discarded (background voice filter)
- DOB step: `<Say>` OUTSIDE `<Gather>` — Twilio only listens after AI finishes speaking (prevents nearby voice pickup)
- Conversation turns: `<Say>` INSIDE `<Gather>` — patient can barge in (interrupt AI)
- `speechTimeout`: 2s for DOB step, 3s for conversation turns
- Stale webhook guard: if `callStatus` is already terminal (`escalated/completed/voicemail/failed`) → return `<Hangup/>` immediately

## Transcript

- Stored in `transcriptJson` on CallJob
- Speakers: `ai`, `patient` (never `system` lifecycle events)
- Deduped via `eventKey` (SHA-256 of content + callSid + step)
- Conversations page filters `speaker !== 'system'` before display

## Follow-Up Tasks

- `ensureFollowUpTaskForCallOutcome()` — deduped: checks for existing open task by `callJobId` first
- Happy path refill (`complete`, `staffFollowUpNeeded=false`) → no task created
- Escalation / pharmacist request → exactly one `StaffTask` created
- `/follow-ups` polls every 5s

## Key Files

| File | Purpose |
|------|---------|
| `server/src/routes/twilio.ts` | All Twilio webhooks, AI/DTMF flow, DOB verification, SMS trigger |
| `server/src/services/callAi.ts` | OpenAI integration, AI prompt, farewell sanitizer |
| `server/src/services/twilioFlow.ts` | TwiML builders, second farewell layer, `<Gather>` config |
| `server/src/services/sms.ts` | SMS follow-up service (sendSmsFollowUp) |
| `server/src/services/phoneProvider.ts` | PhoneProvider abstraction |
| `server/src/routes/config.ts` | Settings + caller ID status endpoint |
| `server/src/routes/callJobs.ts` | CallJob CRUD + audio proxy endpoint |
| `server/src/services/followUpTasks.ts` | Task deduplication, outcome mapping |
| `src/hooks/useCallOperations.ts` | Active call polling (2s active / 8s idle) |
| `src/context/FollowUpContext.tsx` | Follow-up task polling (5s) |
| `src/pages/SettingsPage.tsx` | Caller ID check UI |
| `src/utils/api.ts` | All API fetch functions + types |
| `src/utils/callJobToConversation.ts` | Maps CallJob → Conversation view model |
| `src/components/conversations/CallRecordingPlayer.tsx` | Recording player (real audio when URL present) |

## Roadmap — What Is Done ✓

- [x] AI outbound call flow (greeting → DOB → question → answer → complete/escalate)
- [x] DOB verified before any prescription info is shared; echoes back on wrong input
- [x] DOB verified + prescription question combined in same AI response (no dead-end turn)
- [x] Multiple prescriptions: name all, ask once, one yes/no covers all
- [x] 30+ YES phrases and 20+ NO phrases accepted
- [x] Ambiguous answer → AI re-asks with "please say yes or no"
- [x] Two-layer no-goodbye sanitizer
- [x] AMD enabled (`machineDetection: 'Enable'`); voicemail TwiML played on machine answer
- [x] Call recording: `record: true`, webhook, DB field, audio proxy, player UI
- [x] SMS follow-up after completed refill (`server/src/services/sms.ts`)
- [x] Stale webhook guard (terminal status → immediate `<Hangup/>`)
- [x] Transcript: only meaningful speakers, deduped, clean
- [x] Follow-up task deduplication (one task per call)
- [x] Caller ID validation endpoint + Settings page badge
- [x] Active call polling: 2s / idle 8s
- [x] Follow-up task polling: 5s
- [x] Build + lint passing

## Roadmap — What Is Next

- [ ] **IVR/hold music filter** — if call goes to voicemail/IVR, the IVR greeting gets transcribed as patient DOB (e.g. "Thank you for calling. If this is an emergency please dial 91."). Need to detect and discard IVR-pattern phrases before running DOB verification.
- [ ] **Caller ID for `+17508...`** — port or purchase the number in Twilio, then re-check status
- [ ] **Vercel deployment** — `vercel.json` exists but not verified after latest changes
- [ ] **Test framework** — no vitest/jest in repo

## How to Run

```bash
# Start everything (API + frontend + ngrok must already be running)
cd ~/Projects/pharmaflow-ai && npm run dev:all

# Check API is healthy
curl http://localhost:4002/api/health | python3 -m json.tool

# Check caller ID status
curl "http://localhost:4002/api/config/caller-id-status"

# Lint + build
npm run lint && npm run build --prefix server && npm run build
```

## How to Test a Live AI Call

1. `GET /api/health` → confirm `callMode=ai`, `testMode=false`, `liveCallReadiness.ready=true`
2. Add a test patient in UI with DOB `01/01/1980` and 2 prescriptions
3. Start the call from the dashboard
4. When asked for DOB, say: **"zero one zero one"** (= 01/01 MMDD)
5. For happy path: say **"yes"** or **"yes please"** → call completes, SMS sent
6. For escalation: say **"I need to speak with a pharmacist"** → escalated, StaffTask created
7. Check `/conversations` for transcript + recording
8. Check `/follow-ups` for StaffTask (escalation only)
9. Check `smsStatus` on the CallJob (should be `'sent'` if SMS enabled)
