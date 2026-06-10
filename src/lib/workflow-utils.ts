import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowNodeData } from '@/types'

export function workflowToExport(workflow: Workflow): string {
  return JSON.stringify(
    { name: workflow.name, nodes: workflow.nodes, edges: workflow.edges },
    null,
    2,
  )
}

export function parseWorkflowImport(
  json: string,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null {
  try {
    const parsed = JSON.parse(json) as {
      nodes?: WorkflowNode[]
      edges?: WorkflowEdge[]
    }
    if (!parsed.nodes || !parsed.edges) return null
    return {
      nodes: parsed.nodes.map((n) => ({ ...n, id: n.id || crypto.randomUUID() })),
      edges: parsed.edges.map((e) => ({ ...e, id: e.id || crypto.randomUUID() })),
    }
  } catch {
    return null
  }
}

export function getDefaultConfig(nodeType: string): Record<string, string | number | boolean> {
  const configs: Record<string, Record<string, string | number | boolean>> = {
    'Scheduled Outreach': {
      campaign: 'refill_reminder_daily',
      dialWindow: 'Mon–Fri 10am–7pm',
      maxAttempts: 3,
      callerId: '+1 (555) 482-9100',
    },
    'Place Outbound Call': {
      voice: 'Pharmacy Assistant',
      script: 'refill_reminder_v2',
      amd: 'leave_voicemail',
      recordConsent: true,
    },
    'Inbound Call': {
      triggerNumber: '+1 (555) 482-9100',
      businessHours: 'Mon–Fri 8am–8pm, Sat 9am–5pm',
      language: 'en-US',
    },
    'Speech to Text': { model: 'whisper-pharmacy-v2', language: 'en-US' },
    'Intent Detection': {
      confidenceThreshold: 0.82,
      fallback: 'Human Escalation',
      intents: 'refill,status,faq,transfer,pharmacist',
    },
    'Verify patient DOB': { retries: 2, lockAfterFailures: true },
    'Check refill eligibility': { pmsLookup: true, controlledSubstanceCheck: true },
    'Send SMS': {
      template: 'Your refill for {{medication}} is confirmed. Ready {{date}}.',
      sender: '+1 (555) 482-9100',
    },
    'Update PMS': { action: 'update_refill_status', recordType: 'prescription' },
    'Log Event': { eventType: 'workflow_step_complete', storeMetadata: true },
    'Human Escalation': { queue: 'Clinical Triage', urgency: 'high' },
    'Lookup mock prescription': { source: 'mock_pms', includeCopay: true },
    'FAQ Agent': { knowledgeBase: 'store-faq-v3', maxTokens: 256 },
    'Assign Staff Queue': { queue: 'Front Counter', notifySlack: true },
    'Audit Log': { eventType: 'phi_access', retentionDays: 2555 },
  }
  return configs[nodeType] ?? { note: 'Configure this node' }
}

export function createPaletteNode(
  type: string,
  label: string,
  category: WorkflowNodeData['category'],
  position: { x: number; y: number },
): WorkflowNode {
  return {
    id: crypto.randomUUID(),
    type: 'pharma',
    position,
    data: {
      label,
      category,
      nodeType: type,
      config: getDefaultConfig(type),
      executionState: 'idle',
    },
  }
}
