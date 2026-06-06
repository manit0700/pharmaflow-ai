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
  "summary": "One sentence for pharmacy staff logs"
}`

const SAFETY_RULES = `You are a pharmacy outbound-call assistant for ${config.pharmacyName}.
Rules:
- Never give medical advice, dosing, diagnoses, or drug interactions.
- Never discuss other patients or share PHI beyond confirming identity.
- Keep calls brief and professional.
- Escalate to staff (action "transfer") for side effects, allergies, emergencies, insurance disputes, or angry callers.
- Use action "callback" when the patient wants a staff callback later.
- Use action "complete" when the call goal is resolved.
- Use action "continue" while verifying DOB or gathering the patient's answer.
- Verify date of birth before discussing prescription details.
- Map the patient's answer to one clear patientResponse label when resolved.`

export function buildAiSystemPrompt(reason: CallReason, ctx: ScriptContext): string {
  const script = getCallScript(reason)
  const optionsBlock = script.options
    .map((o) => `- ${o.label} → patientResponse: "${o.patientResponse}" (action hint: ${o.action})`)
    .join('\n')

  return [
    SAFETY_RULES,
    '',
    `Call reason: ${script.title} (${reason})`,
    `Patient: ${ctx.patientName}`,
    `Medication: ${ctx.medicationName || 'not specified'}`,
    '',
    'Script reference (use these canonical patientResponse labels when possible):',
    fillTemplate(script.greeting, ctx),
    script.dobPrompt,
    script.mainMenu(ctx),
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

function parseAiTurn(raw: string): AiCallTurn {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      spoken: 'Thank you for your time. A pharmacy team member will follow up if needed. Goodbye.',
      patientResponse: 'Could not parse AI response',
      action: 'complete',
      summary: 'AI response parse failure',
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<AiCallTurn>
    const action = parsed.action
    const validActions: AiCallAction[] = ['complete', 'transfer', 'callback', 'continue']
    return {
      spoken:
        typeof parsed.spoken === 'string' && parsed.spoken.trim()
          ? parsed.spoken.trim()
          : 'Thank you. Goodbye.',
      patientResponse:
        typeof parsed.patientResponse === 'string' ? parsed.patientResponse.trim() : null,
      action: validActions.includes(action as AiCallAction) ? (action as AiCallAction) : 'continue',
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined,
    }
  } catch {
    return {
      spoken: 'Thank you for calling. Goodbye.',
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
  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...params.history.filter((m) => m.role !== 'system'),
    { role: 'user', content: params.userText },
  ]

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
