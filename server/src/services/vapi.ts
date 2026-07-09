import axios from 'axios'
import { config, isVapiConfigured as isConfigured } from '../config.js'

export function isVapiConfigured(): boolean {
  return isConfigured()
}

export async function startVapiCall({
  to,
  callJobId,
  patientName,
  metadata = {},
}: {
  to: string
  callJobId: string
  patientName: string
  metadata?: Record<string, unknown>
}): Promise<{ id: string }> {
  const res = await axios.post<{ id: string }>(
    'https://api.vapi.ai/call',
    {
      assistantId: config.vapiAssistantId,
      phoneNumberId: config.vapiPhoneNumberId,
      customer: { number: to, name: patientName },
      metadata: { callJobId, ...metadata },
    },
    {
      headers: {
        Authorization: `Bearer ${config.vapiApiKey}`,
        'Content-Type': 'application/json',
      },
    },
  )
  return res.data
}
