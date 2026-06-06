import type {
  AnalyticsSeries,
  AuditEvent,
  Conversation,
  IntegrationStatus,
  KPIStat,
  NotificationItem,
  PrescriptionRecord,
  StaffQueue,
  Workflow,
  WorkflowRun,
  WorkflowTemplate,
} from '@/types'
import type { WorkflowNode, WorkflowEdge } from '@/types'
import { buildRecording } from '@/utils/recording'

const now = Date.now()
const ago = (mins: number) => new Date(now - mins * 60000).toISOString()
const daysAgo = (d: number) => {
  const dt = new Date()
  dt.setDate(dt.getDate() - d)
  return dt.toISOString().slice(0, 10)
}

export const kpis: KPIStat[] = [
  { id: '1', label: 'Outbound calls placed', value: '2,184', change: '+14%', trend: 'up' },
  { id: '2', label: 'Patients reached (live)', value: '1,642', change: '+9%', trend: 'up' },
  { id: '3', label: 'Refill reminders confirmed', value: '892', change: '+11%', trend: 'up' },
  { id: '4', label: 'Voicemail / no answer', value: '412', change: '-3%', trend: 'down' },
  { id: '5', label: 'Callbacks scheduled', value: '186', change: '+6%', trend: 'up' },
  { id: '6', label: 'Avg call duration', value: '1m 48s', change: '-12s', trend: 'up' },
  { id: '7', label: 'Outbound completion rate', value: '78.4%', change: '+3.2%', trend: 'up' },
]

export const analyticsSeries: AnalyticsSeries[] = Array.from({ length: 7 }, (_, i) => {
  const d = 6 - i
  return {
    date: daysAgo(d),
    refill: 45 + Math.floor(Math.random() * 30),
    status: 22 + Math.floor(Math.random() * 15),
    faq: 18 + Math.floor(Math.random() * 12),
    transfer: 8 + Math.floor(Math.random() * 8),
    escalation: 5 + Math.floor(Math.random() * 6),
    voice: 80 + Math.floor(Math.random() * 40),
    sms: 55 + Math.floor(Math.random() * 35),
  }
})

export const workflowVolumeByCategory = [
  { name: 'Refill reminder', value: 892, fill: '#0d9488' },
  { name: 'Ready for pickup', value: 524, fill: '#0891b2' },
  { name: 'Adherence check', value: 318, fill: '#64748b' },
  { name: 'Prior auth follow-up', value: 186, fill: '#0e7490' },
  { name: 'Staff callback', value: 94, fill: '#d97706' },
]

export const escalationReasons = [
  { reason: 'Patient requested pharmacist', count: 38 },
  { reason: 'Clinical question on call', count: 26 },
  { reason: 'Wrong number / not patient', count: 22 },
  { reason: 'Insurance / copay dispute', count: 18 },
  { reason: 'No answer after 3 attempts', count: 44 },
]

export const staffQueues: StaffQueue[] = [
  { id: '1', name: 'Outbound Callback', waiting: 4, avgWaitMin: 3.1, staffOnDuty: 2 },
  { id: '2', name: 'Clinical Follow-up', waiting: 2, avgWaitMin: 5.4, staffOnDuty: 1 },
  { id: '3', name: 'Billing / Copay', waiting: 2, avgWaitMin: 8.4, staffOnDuty: 1 },
  { id: '4', name: 'Voicemail Retry', waiting: 12, avgWaitMin: 0.5, staffOnDuty: 0 },
]

export const integrations: IntegrationStatus[] = [
  { id: 'twilio', name: 'Twilio', category: 'Voice & SMS', connected: true, health: 'healthy', lastSync: ago(2), summary: 'Voice + SMS channels active' },
  { id: 'openai', name: 'OpenAI', category: 'AI', connected: true, health: 'healthy', lastSync: ago(1), summary: 'Intent + summarization models' },
  { id: 'eleven', name: 'ElevenLabs', category: 'Voice', connected: true, health: 'healthy', lastSync: ago(5), summary: 'TTS voice: Pharmacy Assistant' },
  { id: 'pms', name: 'Pharmacy PMS', category: 'Records', connected: true, health: 'degraded', lastSync: ago(12), summary: 'Rx lookup latency elevated' },
  { id: 'slack', name: 'Slack', category: 'Staff alerts', connected: true, health: 'healthy', lastSync: ago(3), summary: '#pharmacy-escalations channel' },
  { id: 'email', name: 'Email', category: 'Notifications', connected: true, health: 'healthy', lastSync: ago(20), summary: 'SMTP relay for staff digests' },
  { id: 'webhook', name: 'Webhooks', category: 'Automation', connected: true, health: 'healthy', lastSync: ago(8), summary: '3 active endpoints' },
  { id: 'ehr', name: 'EHR (Mock)', category: 'Patient data', connected: false, health: 'offline', lastSync: '—', summary: 'Demo only — not connected' },
]

export const workflowTemplates: WorkflowTemplate[] = [
  { id: 't1', name: 'Refill Reminder Outbound', description: 'Batch dial → confirm refill → update PMS', usageCount: 892 },
  { id: 't2', name: 'Ready for Pickup Call', description: 'Notify patient Rx is ready', usageCount: 524 },
  { id: 't3', name: 'Adherence Check-in', description: 'Medication sync + schedule callback', usageCount: 318 },
  { id: 't4', name: 'Prior Auth Follow-up', description: 'Status update + document capture', usageCount: 186 },
  { id: 't5', name: 'Voicemail Retry Campaign', description: 'Re-dial no-answer cohort', usageCount: 156 },
  { id: 't6', name: 'Staff Callback Queue', description: 'Patient asked for live pharmacist', usageCount: 94 },
]

export const prescriptions: PrescriptionRecord[] = [
  { id: 'rx1', patientId: 'p1', medication: 'Lisinopril 10mg', status: 'ready', refillsRemaining: 2, readyAt: ago(30) },
  { id: 'rx2', patientId: 'p2', medication: 'Metformin 500mg', status: 'in_progress', refillsRemaining: 1 },
  { id: 'rx3', patientId: 'p3', medication: 'Atorvastatin 20mg', status: 'ready', refillsRemaining: 3, readyAt: ago(60) },
  { id: 'rx4', patientId: 'p4', medication: 'Amoxicillin 500mg', status: 'on_hold', refillsRemaining: 0 },
  { id: 'rx5', patientId: 'p5', medication: 'Omeprazole 20mg', status: 'in_progress', refillsRemaining: 2 },
  { id: 'rx6', patientId: 'p6', medication: 'Levothyroxine 50mcg', status: 'ready', refillsRemaining: 1, readyAt: ago(15) },
]

export const auditEvents: AuditEvent[] = [
  { id: 'a1', timestamp: '2026-06-04T22:32:00-05:00', actor: 'workflow-engine', action: 'PHI_ACCESS', resource: 'prescription/rx1', severity: 'info', details: 'Status lookup for patient M. Johnson' },
  { id: 'a2', timestamp: '2026-06-04T22:25:00-05:00', actor: 'ai-agent', action: 'CONSENT_CHECK', resource: 'call/c-1042', severity: 'info', details: 'Verbal consent recorded for SMS follow-up' },
  { id: 'a3', timestamp: '2026-06-04T22:19:00-05:00', actor: 'staff@pharmacy', action: 'MANUAL_REVIEW', resource: 'conversation/c-1038', severity: 'warning', details: 'Escalated clinical question reviewed' },
  { id: 'a4', timestamp: '2026-06-04T22:12:00-05:00', actor: 'workflow-engine', action: 'REDACTION', resource: 'transcript/c-1035', severity: 'info', details: 'DOB masked in exported log' },
  { id: 'a5', timestamp: '2026-06-04T21:57:00-05:00', actor: 'system', action: 'WORKFLOW_FAILED', resource: 'run/wr-2018', severity: 'critical', details: 'PMS timeout during refill update' },
  { id: 'a6', timestamp: '2026-06-04T21:42:00-05:00', actor: 'ai-agent', action: 'ESCALATION', resource: 'queue/clinical', severity: 'warning', details: 'Patient requested pharmacist — routed to Clinical Triage' },
  { id: 'a7', timestamp: '2026-06-04T21:27:00-05:00', actor: 'workflow-engine', action: 'AUDIT_LOG', resource: 'refill-batch', severity: 'info', details: 'Nightly refill reminder batch completed (214 sent)' },
  { id: 'a8', timestamp: '2026-06-04T21:07:00-05:00', actor: 'admin', action: 'ACCESS_REVIEW', resource: 'role/pharmacist', severity: 'info', details: 'Quarterly access review marker applied (demo)' },
  { id: 'a9', timestamp: '2026-06-04T20:37:00-05:00', actor: 'ai-agent', action: 'TRANSFER_INTAKE', resource: 'ticket/t-442', severity: 'info', details: 'Transfer from CVS #2841 — staff notified' },
  { id: 'a10', timestamp: '2026-06-04T20:07:00-05:00', actor: 'system', action: 'RETENTION', resource: 'logs/archive', severity: 'info', details: 'Mock retention policy: transcripts > 90 days archived' },
]

export const notifications: NotificationItem[] = [
  { id: 'n1', title: 'Outbound batch', body: '214 refill reminders queued for 2 PM dial', time: ago(15), read: false },
  { id: 'n2', title: 'Performance', body: 'Outbound connect rate up 6% this week', time: ago(120), read: false },
  { id: 'n3', title: 'Integration', body: 'Twilio outbound trunk healthy', time: ago(45), read: true },
]

function buildDefaultWorkflow(): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [
    { id: 'n1', type: 'pharma', position: { x: 0, y: 180 }, data: { label: 'Scheduled Outreach', category: 'trigger', nodeType: 'Scheduled Outreach', config: {}, executionState: 'idle' } },
    { id: 'n2', type: 'pharma', position: { x: 220, y: 180 }, data: { label: 'Consent Check', category: 'compliance', nodeType: 'Consent Check', config: {}, executionState: 'idle' } },
    { id: 'n3', type: 'pharma', position: { x: 440, y: 180 }, data: { label: 'Load PMS Cohort', category: 'action', nodeType: 'Update PMS', config: {}, executionState: 'idle' } },
    { id: 'n4', type: 'pharma', position: { x: 660, y: 180 }, data: { label: 'Place Outbound Call', category: 'action', nodeType: 'Place Outbound Call', config: {}, executionState: 'idle' } },
    { id: 'n5', type: 'pharma', position: { x: 880, y: 180 }, data: { label: 'Speech to Text', category: 'ai', nodeType: 'Speech to Text', config: {}, executionState: 'idle' } },
    { id: 'n6', type: 'pharma', position: { x: 1100, y: 180 }, data: { label: 'Intent Detection', category: 'ai', nodeType: 'Intent Detection', config: {}, executionState: 'idle' } },
    { id: 'n7', type: 'pharma', position: { x: 1320, y: 180 }, data: { label: 'Branch', category: 'logic', nodeType: 'Switch', config: {}, executionState: 'idle' } },
    { id: 'n8', type: 'pharma', position: { x: 1560, y: 40 }, data: { label: 'Refill Confirmed', category: 'action', nodeType: 'Send Refill Reminder', config: {}, executionState: 'idle' } },
    { id: 'n9', type: 'pharma', position: { x: 1560, y: 160 }, data: { label: 'Voicemail', category: 'logic', nodeType: 'Retry', config: {}, executionState: 'idle' } },
    { id: 'n10', type: 'pharma', position: { x: 1560, y: 280 }, data: { label: 'Human Callback', category: 'logic', nodeType: 'Human Escalation', config: {}, executionState: 'idle' } },
    { id: 'n11', type: 'pharma', position: { x: 1780, y: 40 }, data: { label: 'Update PMS', category: 'action', nodeType: 'Update PMS', config: {}, executionState: 'idle' } },
    { id: 'n12', type: 'pharma', position: { x: 1780, y: 160 }, data: { label: 'Schedule Retry', category: 'action', nodeType: 'Generate Follow-up Task', config: {}, executionState: 'idle' } },
    { id: 'n13', type: 'pharma', position: { x: 1780, y: 280 }, data: { label: 'Assign Staff', category: 'action', nodeType: 'Assign Staff Queue', config: {}, executionState: 'idle' } },
    { id: 'n14', type: 'pharma', position: { x: 2000, y: 180 }, data: { label: 'Call Summary', category: 'ai', nodeType: 'Conversation Summary', config: {}, executionState: 'idle' } },
    { id: 'n15', type: 'pharma', position: { x: 2220, y: 180 }, data: { label: 'Audit Log', category: 'compliance', nodeType: 'Audit Log', config: {}, executionState: 'idle' } },
  ]
  const edges: WorkflowEdge[] = [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
    { id: 'e4', source: 'n4', target: 'n5' },
    { id: 'e5', source: 'n5', target: 'n6' },
    { id: 'e6', source: 'n6', target: 'n7' },
    { id: 'e7', source: 'n7', target: 'n8', label: 'Confirmed' },
    { id: 'e8', source: 'n8', target: 'n11' },
    { id: 'e9', source: 'n7', target: 'n9', label: 'Voicemail' },
    { id: 'e10', source: 'n9', target: 'n12' },
    { id: 'e11', source: 'n7', target: 'n10', label: 'Pharmacist' },
    { id: 'e12', source: 'n10', target: 'n13' },
    { id: 'e13', source: 'n11', target: 'n14' },
    { id: 'e14', source: 'n12', target: 'n14' },
    { id: 'e15', source: 'n13', target: 'n14' },
    { id: 'e16', source: 'n14', target: 'n15' },
  ]
  return { nodes, edges }
}

const defaultWf = buildDefaultWorkflow()

export const initialWorkflows: Workflow[] = [
  {
    id: 'wf-main',
    name: 'Refill Reminder Outbound',
    description: 'Scheduled batch → dial patient → confirm refill → PMS update',
    status: 'active',
    updatedAt: ago(30),
    nodes: defaultWf.nodes,
    edges: defaultWf.edges,
  },
  {
    id: 'wf-ready',
    name: 'Ready for Pickup Outbound',
    description: 'Notify patients when Rx is ready',
    status: 'active',
    updatedAt: ago(120),
    nodes: [
      { id: 'o1', type: 'pharma', position: { x: 0, y: 100 }, data: { label: 'Scheduled Outreach', category: 'trigger', nodeType: 'Scheduled Outreach', config: {}, executionState: 'idle' } },
      { id: 'o2', type: 'pharma', position: { x: 220, y: 100 }, data: { label: 'Place Outbound Call', category: 'action', nodeType: 'Place Outbound Call', config: {}, executionState: 'idle' } },
      { id: 'o3', type: 'pharma', position: { x: 440, y: 100 }, data: { label: 'Update PMS', category: 'action', nodeType: 'Update PMS', config: {}, executionState: 'idle' } },
      { id: 'o4', type: 'pharma', position: { x: 660, y: 100 }, data: { label: 'Audit Log', category: 'compliance', nodeType: 'Audit Log', config: {}, executionState: 'idle' } },
    ],
    edges: [
      { id: 'oe1', source: 'o1', target: 'o2' },
      { id: 'oe2', source: 'o2', target: 'o3' },
      { id: 'oe3', source: 'o3', target: 'o4' },
    ],
  },
  {
    id: 'wf-retry',
    name: 'Voicemail Retry Campaign',
    description: 'Re-dial patients who did not answer',
    status: 'draft',
    updatedAt: ago(300),
    nodes: [
      { id: 'v1', type: 'pharma', position: { x: 0, y: 100 }, data: { label: 'Scheduled Outreach', category: 'trigger', nodeType: 'Scheduled Outreach', config: {}, executionState: 'idle' } },
      { id: 'v2', type: 'pharma', position: { x: 220, y: 100 }, data: { label: 'Retry', category: 'logic', nodeType: 'Retry', config: {}, executionState: 'idle' } },
      { id: 'v3', type: 'pharma', position: { x: 440, y: 100 }, data: { label: 'Place Outbound Call', category: 'action', nodeType: 'Place Outbound Call', config: {}, executionState: 'idle' } },
      { id: 'v4', type: 'pharma', position: { x: 660, y: 100 }, data: { label: 'Log Event', category: 'compliance', nodeType: 'Log Event', config: {}, executionState: 'idle' } },
    ],
    edges: [
      { id: 've1', source: 'v1', target: 'v2' },
      { id: 've2', source: 'v2', target: 'v3' },
      { id: 've3', source: 'v3', target: 'v4' },
    ],
  },
]

const runTypes: WorkflowRun['requestType'][] = ['refill', 'prescription_status', 'prior_auth', 'other']
const names = ['Maria', 'James', 'Patricia', 'Robert', 'Linda', 'Michael', 'Barbara', 'David', 'Susan', 'Joseph']
const wfNames = ['Refill Reminder Outbound', 'Ready for Pickup Outbound', 'Voicemail Retry Campaign']

export const workflowRuns: WorkflowRun[] = Array.from({ length: 20 }, (_, i) => {
  const escalated = i % 7 === 0
  const noAnswer = i % 5 === 0 && !escalated
  return {
    id: `wr-${2000 + i}`,
    workflowId: 'wf-main',
    workflowName: wfNames[i % wfNames.length]!,
    patientFirstName: names[i % names.length]!,
    channel: 'voice' as const,
    requestType: runTypes[i % runTypes.length]!,
    aiResolutionStatus: escalated ? 'escalated' : noAnswer ? 'pending' : 'resolved',
    escalationReason: escalated
      ? escalationReasons[i % escalationReasons.length]!.reason
      : noAnswer
        ? 'No answer — retry scheduled'
        : undefined,
    durationSec: 35 + i * 8,
    startedAt: ago(i * 8 + 5),
    auditTrail: [
      'Outbound dial initiated',
      escalated ? 'Transferred to staff callback' : noAnswer ? 'Voicemail left' : 'Refill confirmed on call',
      'Audit log written',
    ],
  }
})

/** Outbound-only call logs (pharmacy initiates the call). */
const conversationsSeed: Omit<Conversation, 'recording'>[] = [
  {
    id: 'c-1001',
    patientFirstName: 'Maria',
    channel: 'voice',
    requestType: 'refill',
    aiConfidence: 0.94,
    resolutionStatus: 'resolved',
    durationSec: 98,
    startedAt: ago(25),
    workflowName: 'Refill Reminder Outbound',
    extractedData: { medication: 'Lisinopril 10mg', outcome: 'refill_confirmed', refillsRemaining: '2' },
    messages: [
      { id: '1', role: 'ai', content: 'Hi Maria, this is Maple Street Pharmacy calling about your Lisinopril refill. It’s due soon — would you like us to fill it?', timestamp: ago(25) },
      { id: '2', role: 'patient', content: 'Yes, please go ahead.', timestamp: ago(24) },
      { id: '3', role: 'ai', content: 'Great, your refill is submitted. It should be ready tomorrow by 2 PM. Thank you!', timestamp: ago(23) },
    ],
    transcript: [
      { speaker: 'ai', text: 'Hi Maria, this is Maple Street Pharmacy…', startSec: 0 },
      { speaker: 'patient', text: 'Yes, please go ahead.', startSec: 18 },
      { speaker: 'ai', text: 'Refill submitted — ready tomorrow 2 PM.', startSec: 32 },
    ],
  },
  {
    id: 'c-1002',
    patientFirstName: 'James',
    channel: 'voice',
    requestType: 'prescription_status',
    aiConfidence: 0.91,
    resolutionStatus: 'resolved',
    durationSec: 72,
    startedAt: ago(40),
    workflowName: 'Ready for Pickup Outbound',
    extractedData: { medication: 'Lisinopril 10mg', outcome: 'pickup_confirmed' },
    messages: [
      { id: '1', role: 'ai', content: 'Hi James, Maple Street Pharmacy — your prescription is ready for pickup today.', timestamp: ago(40) },
      { id: '2', role: 'patient', content: 'Perfect, I’ll stop by this afternoon.', timestamp: ago(39) },
    ],
    transcript: [
      { speaker: 'ai', text: 'Your Rx is ready for pickup today.', startSec: 0 },
      { speaker: 'patient', text: 'I’ll stop by this afternoon.', startSec: 14 },
    ],
  },
  {
    id: 'c-1003',
    patientFirstName: 'Patricia',
    channel: 'voice',
    requestType: 'other',
    aiConfidence: 0.88,
    resolutionStatus: 'pending',
    durationSec: 22,
    startedAt: ago(55),
    workflowName: 'Voicemail Retry Campaign',
    extractedData: { outcome: 'voicemail', retryAt: 'tomorrow 10am' },
    messages: [
      { id: '1', role: 'ai', content: 'Hi Patricia, Maple Street Pharmacy with a refill reminder. Please call us back at 555-482-9100.', timestamp: ago(55) },
    ],
    transcript: [{ speaker: 'ai', text: 'Voicemail message left.', startSec: 0 }],
  },
  {
    id: 'c-1004',
    patientFirstName: 'Robert',
    channel: 'voice',
    requestType: 'prior_auth',
    aiConfidence: 0.86,
    resolutionStatus: 'resolved',
    durationSec: 124,
    startedAt: ago(70),
    workflowName: 'Prior Auth Follow-up',
    extractedData: { medication: 'Atorvastatin 20mg', paStatus: 'approved' },
    messages: [
      { id: '1', role: 'ai', content: 'Hi Robert, calling with an update — your prior authorization was approved. We can fill your Atorvastatin now.', timestamp: ago(70) },
      { id: '2', role: 'patient', content: 'That’s great, thank you.', timestamp: ago(69) },
    ],
    transcript: [
      { speaker: 'ai', text: 'Prior auth approved — ready to fill.', startSec: 0 },
      { speaker: 'patient', text: 'Thank you.', startSec: 45 },
    ],
  },
  {
    id: 'c-1005',
    patientFirstName: 'Linda',
    channel: 'voice',
    requestType: 'escalation',
    aiConfidence: 0.72,
    resolutionStatus: 'escalated',
    escalationReason: 'Patient requested pharmacist',
    durationSec: 95,
    startedAt: ago(85),
    workflowName: 'Refill Reminder Outbound',
    extractedData: { queue: 'Outbound Callback' },
    messages: [
      { id: '1', role: 'ai', content: 'Hi Linda, Maple Street Pharmacy — calling about your blood pressure refill.', timestamp: ago(85) },
      { id: '2', role: 'patient', content: 'I need to talk to a pharmacist about side effects.', timestamp: ago(84) },
      { id: '3', role: 'ai', content: 'I’ll schedule a pharmacist callback within the hour. A team member will call you back.', timestamp: ago(83) },
    ],
    transcript: [
      { speaker: 'ai', text: 'Refill reminder outbound call.', startSec: 0 },
      { speaker: 'patient', text: 'Need pharmacist re: side effects.', startSec: 22 },
    ],
  },
  {
    id: 'c-1006',
    patientFirstName: 'Michael',
    channel: 'voice',
    requestType: 'refill',
    aiConfidence: 0.9,
    resolutionStatus: 'resolved',
    durationSec: 81,
    startedAt: ago(100),
    workflowName: 'Adherence Check-in',
    extractedData: { medication: 'Metformin 500mg', takingAsPrescribed: 'yes' },
    messages: [
      { id: '1', role: 'ai', content: 'Hi Michael, quick adherence check — are you still taking your Metformin as prescribed?', timestamp: ago(100) },
      { id: '2', role: 'patient', content: 'Yes, every morning with breakfast.', timestamp: ago(99) },
      { id: '3', role: 'ai', content: 'Thank you. Your next refill is on track for next week.', timestamp: ago(98) },
    ],
    transcript: [
      { speaker: 'ai', text: 'Adherence check-in outbound.', startSec: 0 },
      { speaker: 'patient', text: 'Yes, every morning.', startSec: 20 },
    ],
  },
  {
    id: 'c-1007',
    patientFirstName: 'Barbara',
    channel: 'voice',
    requestType: 'refill',
    aiConfidence: 0.65,
    resolutionStatus: 'escalated',
    escalationReason: 'Insurance / copay dispute',
    durationSec: 110,
    startedAt: ago(115),
    workflowName: 'Refill Reminder Outbound',
    extractedData: { medication: 'Humira (mock)' },
    messages: [
      { id: '1', role: 'ai', content: 'Hi Barbara, calling about your refill — do you want us to process it?', timestamp: ago(115) },
      { id: '2', role: 'patient', content: 'What is the copay? Last time it was wrong.', timestamp: ago(114) },
      { id: '3', role: 'ai', content: 'I’ll have our billing team call you back today with copay details.', timestamp: ago(113) },
    ],
    transcript: [
      { speaker: 'ai', text: 'Outbound refill reminder.', startSec: 0 },
      { speaker: 'patient', text: 'Copay question — escalate.', startSec: 25 },
    ],
  },
  {
    id: 'c-1008',
    patientFirstName: 'David',
    channel: 'voice',
    requestType: 'refill',
    aiConfidence: 0.93,
    resolutionStatus: 'resolved',
    durationSec: 64,
    startedAt: ago(130),
    workflowName: 'Refill Reminder Outbound',
    extractedData: { medication: 'Omeprazole 20mg', outcome: 'refill_confirmed' },
    messages: [
      { id: '1', role: 'ai', content: 'Hi David, Omeprazole refill is due — shall we fill it for pickup Thursday?', timestamp: ago(130) },
      { id: '2', role: 'patient', content: 'Yes please.', timestamp: ago(129) },
    ],
    transcript: [
      { speaker: 'ai', text: 'Omeprazole refill offer.', startSec: 0 },
      { speaker: 'patient', text: 'Yes please.', startSec: 12 },
    ],
  },
]

export const conversations: Conversation[] = conversationsSeed.map((c) => ({
  ...c,
  recording: buildRecording(c.id, c.patientFirstName, c.durationSec || 22, c.startedAt),
}))

export const nodePalette = {
  trigger: [
    { type: 'Scheduled Outreach', label: 'Scheduled Outreach', category: 'trigger' as const, description: 'Outbound dial batch (refill, ready, etc.)' },
    { type: 'Webhook Trigger', label: 'Webhook', category: 'trigger' as const, description: 'Trigger outbound from PMS event' },
    { type: 'Inbound Call', label: 'Inbound Call', category: 'trigger' as const, description: 'Optional — patient called back' },
  ],
  ai: [
    { type: 'Speech to Text', label: 'Speech to Text', category: 'ai' as const, description: 'Transcribe audio' },
    { type: 'Intent Detection', label: 'Intent Detection', category: 'ai' as const, description: 'Classify caller intent' },
    { type: 'Entity Extraction', label: 'Entity Extraction', category: 'ai' as const, description: 'Extract Rx, DOB, etc.' },
    { type: 'FAQ Agent', label: 'FAQ Agent', category: 'ai' as const, description: 'Knowledge base answers' },
    { type: 'Conversation Summary', label: 'Summary', category: 'ai' as const, description: 'Post-call summary' },
    { type: 'Patient Sentiment', label: 'Sentiment', category: 'ai' as const, description: 'Tone analysis' },
    { type: 'Risk Flagging', label: 'Risk Flagging', category: 'ai' as const, description: 'Safety flags' },
  ],
  logic: [
    { type: 'If / Else', label: 'If / Else', category: 'logic' as const, description: 'Conditional branch' },
    { type: 'Switch', label: 'Switch', category: 'logic' as const, description: 'Multi-way branch' },
    { type: 'Retry', label: 'Retry', category: 'logic' as const, description: 'Retry on failure' },
    { type: 'Delay', label: 'Delay', category: 'logic' as const, description: 'Wait step' },
    { type: 'Human Escalation', label: 'Human Escalation', category: 'logic' as const, description: 'Route to staff' },
    { type: 'Approval Check', label: 'Approval', category: 'logic' as const, description: 'Pharmacist approval' },
  ],
  action: [
    { type: 'Place Outbound Call', label: 'Outbound Call', category: 'action' as const, description: 'Dial patient (primary step)' },
    { type: 'Send Refill Reminder', label: 'Refill Reminder', category: 'action' as const, description: 'Confirm refill on live answer' },
    { type: 'Generate Follow-up Task', label: 'Follow-up Task', category: 'action' as const, description: 'Retry or staff callback' },
    { type: 'Send SMS', label: 'Send SMS', category: 'action' as const, description: 'Optional fallback after no answer' },
    { type: 'Update PMS', label: 'Update PMS', category: 'action' as const, description: 'Sync pharmacy system' },
    { type: 'Create Ticket', label: 'Create Ticket', category: 'action' as const, description: 'Staff work item' },
    { type: 'Assign Staff Queue', label: 'Assign Queue', category: 'action' as const, description: 'Queue routing' },
    { type: 'Log Event', label: 'Log Event', category: 'action' as const, description: 'Operational log' },
  ],
  compliance: [
    { type: 'Audit Log', label: 'Audit Log', category: 'compliance' as const, description: 'Compliance record' },
    { type: 'PHI Redaction', label: 'PHI Redaction', category: 'compliance' as const, description: 'Mask sensitive fields' },
    { type: 'Consent Check', label: 'Consent Check', category: 'compliance' as const, description: 'Verify consent' },
    { type: 'Retention Rule', label: 'Retention', category: 'compliance' as const, description: 'Data retention' },
  ],
}

export const aiVsHuman = [
  { name: 'AI completed', value: 87, fill: '#0d9488' },
  { name: 'Human required', value: 13, fill: '#d97706' },
]

export const channelMix = [
  { name: 'Outbound voice', value: 100 },
]

export const completionByTemplate = workflowTemplates.map((t) => ({
  name: t.name.split(' ').slice(0, 2).join(' '),
  rate: 78 + Math.floor(Math.random() * 18),
}))
