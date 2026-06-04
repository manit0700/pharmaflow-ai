export type WorkflowStatus = 'draft' | 'active' | 'needs_review'
export type NodeExecutionState = 'idle' | 'running' | 'success' | 'failed' | 'escalated'
export type ResolutionStatus = 'resolved' | 'escalated' | 'pending'
export type CommunicationChannel = 'voice' | 'sms' | 'web'
export type RequestType =
  | 'refill'
  | 'prescription_status'
  | 'faq'
  | 'transfer'
  | 'escalation'
  | 'prior_auth'
  | 'missed_call'
  | 'other'

export type NodeCategory = 'trigger' | 'ai' | 'logic' | 'action' | 'compliance'

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string
  category: NodeCategory
  nodeType: string
  config: Record<string, string | number | boolean>
  executionState?: NodeExecutionState
}

export interface Workflow {
  id: string
  name: string
  description: string
  status: WorkflowStatus
  updatedAt: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: WorkflowNodeData
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
  animated?: boolean
}

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowName: string
  patientFirstName: string
  channel: CommunicationChannel
  requestType: RequestType
  aiResolutionStatus: ResolutionStatus
  escalationReason?: string
  durationSec: number
  startedAt: string
  auditTrail: string[]
}

export interface ConversationMessage {
  id: string
  role: 'patient' | 'ai' | 'staff'
  content: string
  timestamp: string
}

export interface TranscriptSegment {
  speaker: 'patient' | 'ai' | 'staff'
  text: string
  startSec: number
}

export interface CallRecording {
  id: string
  fileName: string
  durationSec: number
  recordedAt: string
  waveformPeaks: number[]
  consentCaptured: boolean
  retentionDays: number
  channelLabel: string
}

export interface Conversation {
  id: string
  patientFirstName: string
  channel: CommunicationChannel
  requestType: RequestType
  aiConfidence: number
  resolutionStatus: ResolutionStatus
  escalationReason?: string
  durationSec: number
  startedAt: string
  workflowName: string
  extractedData: Record<string, string>
  messages: ConversationMessage[]
  transcript: TranscriptSegment[]
  recording: CallRecording
}

export interface AuditEvent {
  id: string
  timestamp: string
  actor: string
  action: string
  resource: string
  severity: 'info' | 'warning' | 'critical'
  details: string
}

export interface IntegrationStatus {
  id: string
  name: string
  category: string
  connected: boolean
  health: 'healthy' | 'degraded' | 'offline'
  lastSync: string
  summary: string
}

export interface KPIStat {
  id: string
  label: string
  value: string
  change: string
  trend: 'up' | 'down' | 'neutral'
}

export interface AnalyticsSeries {
  date: string
  refill: number
  status: number
  faq: number
  transfer: number
  escalation: number
  voice: number
  sms: number
}

export interface StaffQueue {
  id: string
  name: string
  waiting: number
  avgWaitMin: number
  staffOnDuty: number
}

export interface PatientProfile {
  id: string
  firstName: string
  lastName: string
  dob: string
  phone: string
}

export interface PrescriptionRecord {
  id: string
  patientId: string
  medication: string
  status: 'ready' | 'in_progress' | 'on_hold'
  refillsRemaining: number
  readyAt?: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  usageCount: number
}

export interface NotificationItem {
  id: string
  title: string
  body: string
  time: string
  read: boolean
}

export interface PaletteNodeDef {
  type: string
  label: string
  category: NodeCategory
  description: string
}
