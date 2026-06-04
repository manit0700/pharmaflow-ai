import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { kpis as baseKpis } from '@/data/mockData'
import { buildRecordingFromTranscript } from '@/utils/recording'
import type { Conversation, KPIStat, RequestType, ResolutionStatus } from '@/types'

export interface LiveCallEvent {
  id: string
  patientFirstName: string
  workflowName: string
  status: ResolutionStatus | 'dialing'
  message: string
  timestamp: string
  recordingSaved?: boolean
}

interface LiveDemoContextValue {
  isLive: boolean
  startDemo: () => void
  stopDemo: () => void
  liveKpis: KPIStat[]
  liveFeed: LiveCallEvent[]
  liveRecordings: Conversation[]
  callsThisSession: number
  activeDials: number
  registerWorkflowRunner: (runner: (() => Promise<void>) | null) => void
}

const LiveDemoContext = createContext<LiveDemoContextValue | null>(null)

const DEMO_PATIENTS = ['Maria', 'James', 'Patricia', 'Robert', 'Linda', 'Michael', 'Karen', 'David']
const DEMO_WORKFLOWS = [
  'Refill Reminder Outbound',
  'Ready for Pickup Outbound',
  'Adherence Check-in',
  'Voicemail Retry Campaign',
]

const OUTCOMES: { status: ResolutionStatus | 'dialing'; message: string }[] = [
  { status: 'dialing', message: 'Dialing patient…' },
  { status: 'resolved', message: 'Refill confirmed on call' },
  { status: 'resolved', message: 'Pickup confirmed — ready today' },
  { status: 'pending', message: 'Voicemail left — retry scheduled' },
  { status: 'escalated', message: 'Callback queued for pharmacist' },
]

function parseKpiValue(value: string): { num: number; suffix: string; isPercent: boolean; isTime: boolean } {
  if (value.includes('%')) return { num: parseFloat(value), suffix: '%', isPercent: true, isTime: false }
  if (value.includes('m')) return { num: 0, suffix: value, isPercent: false, isTime: true }
  const num = parseInt(value.replace(/,/g, ''), 10)
  return { num: isNaN(num) ? 0 : num, suffix: '', isPercent: false, isTime: false }
}

function bumpKpi(stat: KPIStat): KPIStat {
  const parsed = parseKpiValue(stat.value)
  if (parsed.isTime) return stat
  if (parsed.isPercent) {
    const next = Math.min(99.9, parsed.num + 0.1)
    return { ...stat, value: `${next.toFixed(1)}%`, change: '+live' }
  }
  const next = parsed.num + (stat.label.includes('Voicemail') ? 0 : 1)
  return {
    ...stat,
    value: next.toLocaleString() + parsed.suffix,
    change: '+live',
    trend: 'up',
  }
}

export function LiveDemoProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false)
  const [liveKpis, setLiveKpis] = useState<KPIStat[]>(baseKpis)
  const [liveFeed, setLiveFeed] = useState<LiveCallEvent[]>([])
  const [liveRecordings, setLiveRecordings] = useState<Conversation[]>([])
  const [callsThisSession, setCallsThisSession] = useState(0)
  const [activeDials, setActiveDials] = useState(0)
  const workflowRunner = useRef<(() => Promise<void>) | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const workflowTickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const registerWorkflowRunner = useCallback((runner: (() => Promise<void>) | null) => {
    workflowRunner.current = runner
  }, [])

  const pushCall = useCallback((partial?: Partial<LiveCallEvent>) => {
    const outcome = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)]!
    const patient = DEMO_PATIENTS[Math.floor(Math.random() * DEMO_PATIENTS.length)]!
    const wf = DEMO_WORKFLOWS[Math.floor(Math.random() * DEMO_WORKFLOWS.length)]!
    const event: LiveCallEvent = {
      id: crypto.randomUUID(),
      patientFirstName: patient,
      workflowName: wf,
      status: outcome.status,
      message: outcome.message,
      timestamp: new Date().toISOString(),
      ...partial,
    }
    setLiveFeed((prev) => [event, ...prev].slice(0, 12))
    if (event.status !== 'dialing') {
      setCallsThisSession((c) => c + 1)
      setLiveKpis((prev) => prev.map(bumpKpi))
      const requestType: RequestType =
        event.message.includes('Voicemail') ? 'other' : event.message.includes('Pickup') ? 'prescription_status' : 'refill'
      const conv = buildRecordingFromTranscript(
        event.id,
        event.patientFirstName,
        event.workflowName,
        requestType,
        event.status,
        [
          { speaker: 'ai', text: `Hi ${event.patientFirstName}, Maple Street Pharmacy calling. ${event.message}`, startSec: 0 },
          ...(event.status === 'resolved'
            ? [{ speaker: 'patient' as const, text: 'Okay, sounds good.', startSec: 18 }]
            : []),
        ],
        [
          {
            id: '1',
            role: 'ai',
            content: `Hi ${event.patientFirstName}, Maple Street Pharmacy. ${event.message}`,
            timestamp: event.timestamp,
          },
        ],
        event.timestamp,
        event.status === 'escalated' ? 'Patient requested pharmacist' : undefined,
      )
      setLiveRecordings((prev) => [conv, ...prev].slice(0, 20))
      event.recordingSaved = true
    }
    return event
  }, [])

  const stopDemo = useCallback(() => {
    setIsLive(false)
    setActiveDials(0)
    if (tickRef.current) clearInterval(tickRef.current)
    if (workflowTickRef.current) clearInterval(workflowTickRef.current)
    tickRef.current = null
    workflowTickRef.current = null
    toast.info('Live demo paused')
  }, [])

  const startDemo = useCallback(() => {
    setIsLive(true)
    setLiveKpis(baseKpis.map((k) => ({ ...k })))
    setCallsThisSession(0)
    setLiveRecordings([])
    toast.success('Live demo started — simulating outbound calls', {
      description: 'Calls are recorded automatically. Review them under Outbound Calls.',
    })

    if (location.pathname !== '/workflows') {
      navigate('/workflows')
    }

    pushCall({ status: 'dialing', message: 'Batch dial started — 214 patients in queue' })

    setTimeout(() => {
      workflowRunner.current?.()
    }, 1200)

    tickRef.current = setInterval(() => {
      const dialing = Math.random() < 0.35
      setActiveDials(dialing ? 1 + Math.floor(Math.random() * 3) : 0)
      const event = pushCall(
        dialing ? { status: 'dialing', message: 'Outbound call in progress…' } : undefined,
      )
      if (!dialing && event.status === 'escalated') {
        toast.warning(`${event.patientFirstName} requested a pharmacist callback`)
      } else if (!dialing && event.status === 'resolved') {
        toast.success(`Connected: ${event.patientFirstName} — recording saved`, {
          description: event.message,
          action: {
            label: 'Play',
            onClick: () => navigate('/conversations'),
          },
        })
      } else if (!dialing && event.recordingSaved) {
        toast.info(`Recording saved: ${event.patientFirstName}`, {
          action: { label: 'Listen', onClick: () => navigate('/conversations') },
        })
      }
    }, 5500)

    workflowTickRef.current = setInterval(() => {
      workflowRunner.current?.()
    }, 22000)
  }, [location.pathname, navigate, pushCall])

  const autoStarted = useRef(false)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('demo') === 'live' && !autoStarted.current) {
      autoStarted.current = true
      const t = setTimeout(() => startDemo(), 800)
      return () => clearTimeout(t)
    }
  }, [location.search, startDemo])

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      if (workflowTickRef.current) clearInterval(workflowTickRef.current)
    }
  }, [])

  const value = useMemo(
    () => ({
      isLive,
      startDemo,
      stopDemo,
      liveKpis,
      liveFeed,
      liveRecordings,
      callsThisSession,
      activeDials,
      registerWorkflowRunner,
    }),
    [isLive, startDemo, stopDemo, liveKpis, liveFeed, liveRecordings, callsThisSession, activeDials, registerWorkflowRunner],
  )

  return <LiveDemoContext.Provider value={value}>{children}</LiveDemoContext.Provider>
}

export function useLiveDemo() {
  const ctx = useContext(LiveDemoContext)
  if (!ctx) throw new Error('useLiveDemo must be used within LiveDemoProvider')
  return ctx
}
