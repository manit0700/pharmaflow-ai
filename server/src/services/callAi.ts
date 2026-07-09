import { config, type CallReason } from '../config.js'
import {
  fillTemplate,
  getCallScript,
  type ScriptContext,
} from './callScripts.js'

export type AiCallAction = 'complete' | 'transfer' | 'callback' | 'continue'

export interface AiCallTurn {
  spoken: string
  patientResponse: string | null
  action: AiCallAction
  summary?: string
  dobVerified?: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const AI_JSON_SCHEMA = `Respond with a single JSON object only (no markdown):
{
  "spoken": "What you say to the patient on this turn (1-3 short sentences, plain language)",
  "patientResponse": "Canonical staff-facing label for the patient's intent, or null while still verifying",
  "action": "complete" | "transfer" | "callback" | "continue",
  "dobVerified": true if the patient just confirmed their date of birth THIS turn and you accepted it, false otherwise,
  "summary": "One sentence for pharmacy staff logs"
}`

const SAFETY_RULES = `You are a friendly, professional pharmacy outbound-call assistant for ${config.pharmacyName}.

RULE #1 — NO FAREWELLS (CRITICAL, NON-NEGOTIABLE):
NEVER say goodbye, bye, bye-bye, see you, take care, have a nice day, have a great day, have a wonderful day, good day, farewell, cheers, best wishes, or ANY farewell phrase — not even at the end.
When action is "complete", "transfer", or "callback", your LAST spoken sentence MUST be EXACTLY one of:
  "Thank you. Our pharmacy team has your update."
  "Thank you. A pharmacist will follow up with you."
  "Thank you. We have recorded your answer."
STOP immediately after that sentence. Do NOT add any farewell, well-wish, or closing phrase.

STRICT RULES:
- Never give medical advice, dosing, diagnoses, or drug interactions.
- Never discuss other patients or share PHI beyond confirming identity.
- Keep responses SHORT — 1 to 3 sentences max per turn. No long explanations.
- This is a natural speech call. NEVER say "press 1", "press 2", "press 0", "enter digits", "keypad", or any keypad menu language.
- Ask natural-language questions instead, such as "Would you like us to process that refill today?"
- The patient has already confirmed they are available to talk. Do NOT ask if they are available or if this is a good time — go straight to DOB verification.
- Escalate to staff (action "transfer") for side effects, allergies, emergencies, insurance disputes, or angry callers.
- Use action "callback" when the patient wants a staff callback later.
- Use action "complete" when the call goal is fully resolved.
- Use action "continue" while verifying DOB, gathering the patient's answer, or when multiple prescriptions are not yet all addressed.
- NEVER mention prescription numbers, Rx numbers, or any reference number (e.g. "Rx #12345") — these are private internal records and must never be spoken to the patient.
- ALWAYS verify date of birth BEFORE discussing ANY prescription details, names, or cost.
- The patient's DOB on file is provided below. Ask the patient to say their date of birth, then compare. Accept it only if it matches (month and day must match exactly; year is optional). If it does not match, repeat back what you heard and ask them to confirm or try again — for example: "I heard January second — is that correct? If not, please say your date of birth again." Keep action "continue".
- Set dobVerified: true on the EXACT turn when the patient gives you a matching date of birth. Never set it again after that.
- CRITICAL: On the turn you set dobVerified: true, you MUST say the medication name(s), the copay/cost (if provided), AND the call goal question — all in the same spoken response. Never split these into separate turns. Never say just "Thank you" and stop.
- If there are multiple prescriptions, name ALL of them and ask ONCE: "Would you like us to process all of them today?" Do NOT ask about each prescription one by one. One question, one answer covers all.
- YES — any of these mean YES (complete immediately, patientResponse "Confirmed refill — process today"):
  "yes", "yeah", "yep", "yup", "yah", "sure", "okay", "ok", "alright", "alright then", "please", "yes please", "please do", "go ahead", "go for it", "do it", "let's do it", "process it", "refill it", "sure go ahead", "that's fine", "that works", "sounds good", "of course", "absolutely", "definitely", "certainly", "for sure", "correct", "right", "affirmative", "indeed", "I'd like that", "please process", "yes do it"
- NO — any of these mean NO (complete immediately, patientResponse "Not ready for refill yet"):
  "no", "nope", "nah", "no thanks", "no thank you", "not yet", "not now", "not today", "not right now", "don't need it", "I'm good", "I'm fine", "maybe later", "later", "skip it", "skip", "cancel", "I already have it", "already got it", "already picked it up", "I picked it up", "I have enough", "negative", "not interested", "don't bother", "hold off", "hold on that"
- Accept the first clear yes or no. Never ask "Are you sure?" or any follow-up after a clear yes or no.
- If the patient's response does NOT clearly match any yes or no phrase above (e.g. "maybe", "I think so", "possibly", "let me think", "not sure", "I don't know", "hmm", "what?", "I didn't hear", "can you repeat"), do NOT complete. Keep action "continue" and re-ask: "I just want to confirm — would you like us to process the refill today? Please say yes or no."
- Map the patient's answer to one clear patientResponse label when resolved.

MEDICATION & COST RULE — MANDATORY, NO EXCEPTIONS:
- The moment DOB is verified (dobVerified: true), your spoken response MUST include ALL of the following in order:
  1. The medication name(s) — ALWAYS, even if you think the patient already knows.
  2. The copay/cost — ALWAYS if a cost is provided. Say it as: "Your copay is $X." or "Your total is $X."
  3. The call goal question — e.g. "Would you like us to process the refill today?"
- If there is 1 medication: "Your prescription for [NAME] is ready. Your copay is $X. Would you like us to process it today?"
- If there are 2+ medications: "Your prescriptions for [NAME1] and [NAME2] are ready. Your total is $X. Would you like us to process all of them today?"
- NEVER say "Thank you" and stop after DOB — always continue with medication name + cost + question in the same turn.
- NEVER skip the medication name. NEVER skip the cost if one is provided. These are required every time.`

function buildNaturalCallGoal(reason: CallReason, ctx: ScriptContext): string {
  const names = ctx.prescriptions && ctx.prescriptions.length > 1
    ? ctx.prescriptions.map((p) => p.name).join(', ')
    : ctx.medicationName || 'the prescription'
  const costLine = ctx.prescriptionCost
    ? ` State the total amount due: $${ctx.prescriptionCost.toFixed(2)}.`
    : ''

  if (reason === 'refill_reminder') {
    const rxList2 = ctx.prescriptions && ctx.prescriptions.length > 1 ? ctx.prescriptions : null
    if (rxList2 && rxList2.length > 1) {
      return `After DOB is verified, name ALL ${rxList2.length} prescriptions: ${names}.${costLine} Ask ONE question: "Would you like us to process all of them today?" One yes or no covers all prescriptions — do NOT ask about each one separately. Use action "complete" as soon as the patient answers yes or no. If the patient asks for a pharmacist or staff member, transfer/escalate.`
    }
    return `After DOB is verified, tell the patient the refill may be due for ${names}.${costLine} Ask whether they want the pharmacy to process the refill today. If they are not ready, already picked it up, or do not need it, record that as complete. If they ask for a pharmacist or staff member, transfer/escalate.`
  }
  if (reason === 'pickup_reminder') {
    return `After DOB is verified, tell the patient the prescription is ready for pickup for ${names}.${costLine} Ask whether they plan to pick it up today, need more time, already picked it up, or want pharmacy staff.`
  }
  if (reason === 'delivery_update') {
    return 'After DOB is verified, explain there is a prescription delivery update. Ask whether they are available for delivery today, need to reschedule, already received delivery, or want pharmacy staff.'
  }
  if (reason === 'insurance_update') {
    return 'After DOB is verified, explain there is an insurance-related pharmacy update. Ask whether they are available to talk with staff now or want a callback.'
  }
  return 'After DOB is verified, explain the pharmacy is following up on a prescription matter. Ask whether this is a good time, whether they want a callback, whether it is resolved, or whether they want pharmacy staff.'
}

export function buildAiSystemPrompt(reason: CallReason, ctx: ScriptContext): string {
  const script = getCallScript(reason)
  const optionsBlock = script.options
    .map((o) => `- ${o.label} → patientResponse: "${o.patientResponse}" (action hint: ${o.action})`)
    .join('\n')

  const rxList = ctx.prescriptions && ctx.prescriptions.length > 0
    ? ctx.prescriptions
    : [{ name: ctx.medicationName || 'not specified', cost: 0 }]
  const rxBlock = rxList.map((p) => `  - ${p.name}${p.cost > 0 ? ` ($${p.cost.toFixed(2)})` : ''}`).join('\n')
  const allNames = rxList.map((p) => p.name)
  const namesLine = allNames.length === 1
    ? `Medication to mention by name: ${allNames[0]}`
    : `Medications to mention by name (ALL of them): ${allNames.join(', ')}`
  const costLine = ctx.prescriptionCost
    ? `Total amount due: $${ctx.prescriptionCost.toFixed(2)} — say this after DOB is verified`
    : ''

  const dobLine = ctx.patientDob
    ? `Patient DOB on file: ${ctx.patientDob}. Accept the patient's response if the MONTH and DAY match in ANY format: digits like "0101" or "01 01", spoken like "January first" or "zero one zero one", or full date like "January first nineteen eighty". The year is optional. Only reject if month or day clearly do not match.`
    : 'Patient DOB on file: not available — ask patient to provide their date of birth and accept whatever they say.'

  return [
    SAFETY_RULES,
    '',
    `Call reason: ${script.title} (${reason})`,
    `Patient: ${ctx.patientName}`,
    dobLine,
    `Prescriptions (${rxList.length} total):\n${rxBlock}`,
    namesLine,
    ...(costLine ? [costLine] : []),
    '',
    'Natural speech call goal:',
    fillTemplate(script.greeting, ctx),
    'Ask the patient to tell you their date of birth before prescription details.',
    buildNaturalCallGoal(reason, ctx),
    '',
    'Canonical answer options:',
    optionsBlock,
    '',
    AI_JSON_SCHEMA,
  ].join('\n')
}

export function formatAiPromptForPreview(reason: CallReason, ctx: ScriptContext): string {
  const lines = [
    `=== AI system prompt (${reason}) ===`,
    '',
    buildAiSystemPrompt(reason, ctx),
    '',
    '=== Example first spoken line ===',
    fillTemplate(getCallScript(reason).greeting, ctx) + ' ' + getCallScript(reason).dobPrompt,
  ]
  return lines.join('\n')
}

const FAREWELL_RE = /\b(good[- ]?bye|bye[- ]?bye|bye now|see you|talk (?:to you )?soon|have a (?:nice|great|good|wonderful|blessed) (?:day|evening|night|one)|take care(?: now)?|farewell|so long|cheers|until next time|all the best|best of luck)[,!.]*\s*/gi

const FAREWELL_NUCLEAR_RE = /\b(bye|goodbye|farewell|take care|see you|nice day|great day|good day|wonderful day|best wishes|have a good|have a great|have a nice|have a wonderful|good night|good evening)\b/i

const SAFE_CLOSING = 'Thank you. Our pharmacy team has your update.'

function stripFarewells(raw: string, isClosing: boolean): string {
  const cleaned = raw.trim().replace(FAREWELL_RE, '').replace(/^[,\s!.]+/, '').trim()
  if (!cleaned) return SAFE_CLOSING
  const final = cleaned.replace(/\bbye\b[,!.]?\s*/gi, '').replace(/\bgoodbye\b[,!.]?\s*/gi, '').trim()
  if (!final) return SAFE_CLOSING
  // Nuclear check: if ANY farewell word survived, replace entire response
  if (FAREWELL_NUCLEAR_RE.test(final)) return SAFE_CLOSING
  if (isClosing) return final.replace(/[,]+$/, '').trim()
  return final
}

function parseAiTurn(raw: string): AiCallTurn {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      spoken: 'Thank you for your time. A pharmacy team member will follow up if needed.',
      patientResponse: 'Could not parse AI response',
      action: 'complete',
      summary: 'AI response parse failure',
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<AiCallTurn> & { dobVerified?: unknown }
    const action = parsed.action
    const validActions: AiCallAction[] = ['complete', 'transfer', 'callback', 'continue']
    return {
      spoken: stripFarewells(
        typeof parsed.spoken === 'string' ? parsed.spoken : '',
        parsed.action === 'complete' || parsed.action === 'transfer' || parsed.action === 'callback',
      ),
      patientResponse:
        typeof parsed.patientResponse === 'string' ? parsed.patientResponse.trim() : null,
      action: validActions.includes(action as AiCallAction) ? (action as AiCallAction) : 'continue',
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined,
      dobVerified: parsed.dobVerified === true,
    }
  } catch {
    return {
      spoken: SAFE_CLOSING,
      patientResponse: 'AI JSON parse error',
      action: 'complete',
      summary: 'AI JSON parse error',
    }
  }
}

export function isAiCallConfigured(): boolean {
  return Boolean(config.openaiApiKey.trim())
}

export async function runAiCallTurn(params: {
  reason: CallReason
  ctx: ScriptContext
  history: ChatMessage[]
  userText: string
}): Promise<{ turn: AiCallTurn; history: ChatMessage[] }> {
  if (!isAiCallConfigured()) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const systemPrompt = buildAiSystemPrompt(params.reason, params.ctx)
  const priorMessages = params.history.filter((m) => m.role !== 'system').slice(-20)
  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...priorMessages,
    { role: 'user', content: params.userText },
  ]

  const t0 = Date.now()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: config.callAiModel,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: history,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI API error (${res.status}): ${errText.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  console.log(`[ai-latency] openai=${Date.now()-t0}ms model=${config.callAiModel}`)
  const content = data.choices?.[0]?.message?.content ?? ''
  const turn = parseAiTurn(content)

  const updatedHistory: ChatMessage[] = [
    ...history,
    { role: 'assistant', content },
  ]

  return { turn, history: updatedHistory }
}

export function loadMessageHistory(messagesJson: string | null | undefined): ChatMessage[] {
  if (!messagesJson) return []
  try {
    const parsed = JSON.parse(messagesJson) as ChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
