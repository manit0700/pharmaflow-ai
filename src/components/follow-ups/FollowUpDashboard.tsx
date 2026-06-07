import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw } from 'lucide-react'
import { useFollowUpContext } from '@/context/FollowUpContext'
import { FollowUpHeader } from './FollowUpHeader'
import { FollowUpComplianceBanner } from './FollowUpComplianceBanner'
import { FollowUpSummaryCards } from './FollowUpSummaryCards'
import { FollowUpFiltersBar } from './FollowUpFilters'
import { FollowUpTaskList } from './FollowUpTaskList'
import { FollowUpDetailPanel } from './FollowUpDetailPanel'
import { FollowUpAnalyticsMini } from './FollowUpAnalyticsMini'
import { CreateTaskDrawer } from './CreateTaskDrawer'
import { AddNoteDrawer } from './AddNoteDrawer'
import { AssignStaffDrawer } from './AssignStaffDrawer'
import { RescheduleDrawer } from './RescheduleDrawer'
import {
  computeAnalytics,
  computeSummaryMetrics,
  createActivity,
  createTaskFromInput,
  exportQueueJson,
  filterAndSortTasks,
  formatDueDisplay,
} from './FollowUpHelpers'
import type { AssignedTeam, CreateTaskInput, FollowUpFilters } from '@/types/followUps'

type DrawerMode = 'create' | 'note' | 'assign' | 'reschedule' | null

export function FollowUpDashboard() {
  const { tasks, updateTask, addTask, loading, error, refresh, dataSource } = useFollowUpContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FollowUpFilters>({
    search: '',
    priorityTab: 'all',
    priority: 'all',
    taskType: 'all',
    assigned: 'all',
    dueDate: 'all',
    sort: 'priority_first',
  })
  const [drawer, setDrawer] = useState<DrawerMode>(null)
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!selectedId && tasks[0]?.id) setSelectedId(tasks[0].id)
  }, [tasks, selectedId])

  const filtered = useMemo(() => filterAndSortTasks(tasks, filters), [tasks, filters])
  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? tasks.find((t) => t.id === selectedId) ?? null
  const drawerTask = tasks.find((t) => t.id === drawerTaskId) ?? selected

  const metrics = useMemo(() => computeSummaryMetrics(tasks), [tasks])
  const analytics = useMemo(() => computeAnalytics(tasks), [tasks])

  useEffect(() => {
    const taskParam = searchParams.get('task')
    const callParam = searchParams.get('callId')
    if (taskParam) {
      setSelectedId(taskParam)
    } else if (callParam) {
      const linked = tasks.find((t) => t.relatedCallId === callParam)
      if (linked) setSelectedId(linked.id)
    }
  }, [searchParams, tasks])

  const patchFilters = useCallback((patch: Partial<FollowUpFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
  }, [])

  const handleCreateTask = async (input: CreateTaskInput) => {
    const task = createTaskFromInput(input)
    const created = await addTask(task)
    const id = created?.id ?? task.id
    setSelectedId(id)
    setSearchParams({ task: id })
    toast.success('Follow-up task created')
  }

  const handleAddNote = async (note: string) => {
    if (!drawerTask) return
    const activity = createActivity('note', note)
    await updateTask(drawerTask.id, {
      activity: [...drawerTask.activity, activity],
      lastActivityAt: activity.timestamp,
    })
    toast.success('Note added')
  }

  const handleAssign = async (team: AssignedTeam) => {
    if (!drawerTask) return
    const activity = createActivity('assigned', `Assigned to ${team}.`)
    await updateTask(drawerTask.id, {
      assignedTeam: team,
      activity: [...drawerTask.activity, activity],
      lastActivityAt: activity.timestamp,
    })
    toast.success(`Assigned to ${team}`)
  }

  const handleReschedule = async (date: string, time: string, reason: string) => {
    if (!drawerTask) return
    const activity = createActivity(
      'rescheduled',
      `Rescheduled to ${formatDueDisplay({ ...drawerTask, dueDate: date, dueTime: time })}. Reason: ${reason}`,
    )
    await updateTask(drawerTask.id, {
      dueDate: date,
      dueTime: time,
      activity: [...drawerTask.activity, activity],
      lastActivityAt: activity.timestamp,
    })
    toast.success('Callback rescheduled')
  }

  const handleMarkComplete = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const activity = createActivity('completed', 'Task marked complete.')
    await updateTask(taskId, {
      status: 'Completed',
      activity: [...task.activity, activity],
      lastActivityAt: activity.timestamp,
    })
    toast.success('Task completed')
  }

  const handleReopen = async () => {
    if (!selected) return
    const activity = createActivity('status_changed', 'Task reopened.')
    await updateTask(selected.id, {
      status: 'Open',
      activity: [...selected.activity, activity],
      lastActivityAt: activity.timestamp,
    })
    toast.success('Task reopened')
  }

  const handleStartTask = async () => {
    if (!selected) return
    const activity = createActivity('status_changed', 'Status changed to In Progress.')
    await updateTask(selected.id, {
      status: 'In Progress',
      activity: [...selected.activity, activity],
      lastActivityAt: activity.timestamp,
    })
    toast.success('Task started')
  }

  const handleViewCall = () => {
    if (!selected?.relatedCallId) {
      toast.info('No linked call record. Opening Call Recordings.')
      navigate('/calls')
      return
    }
    navigate(`/calls?callId=${selected.relatedCallId}`)
  }

  const openDrawer = (mode: DrawerMode, taskId?: string) => {
    setDrawer(mode)
    setDrawerTaskId(taskId ?? selected?.id ?? null)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  if (loading && tasks.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[420px]" />
      </div>
    )
  }

  if (error && tasks.length === 0) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="space-y-3 p-6 text-sm">
          <p className="font-medium">We hit a temporary error loading the follow-up queue.</p>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => void handleRefresh()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <FollowUpHeader
        onCreateTask={() => openDrawer('create')}
        onExport={() => exportQueueJson(filtered)}
        onRefresh={() => void handleRefresh()}
        refreshing={refreshing}
      />

      <FollowUpComplianceBanner dataSource={dataSource} />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <FollowUpSummaryCards metrics={metrics} />
      <FollowUpFiltersBar filters={filters} onChange={patchFilters} />
      <FollowUpAnalyticsMini analytics={analytics} />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section aria-label="Follow-up task list">
          <FollowUpTaskList
            tasks={filtered}
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              setSelectedId(id)
              setSearchParams({ task: id })
            }}
            onAssign={(id) => openDrawer('assign', id)}
            onAddNote={(id) => openDrawer('note', id)}
            onReschedule={(id) => openDrawer('reschedule', id)}
            onMarkComplete={(id) => void handleMarkComplete(id)}
            onCreateTask={() => openDrawer('create')}
          />
        </section>

        <section aria-label="Task details">
          <FollowUpDetailPanel
            task={selected}
            onStartTask={() => void handleStartTask()}
            onAssign={() => openDrawer('assign')}
            onAddNote={() => openDrawer('note')}
            onReschedule={() => openDrawer('reschedule')}
            onMarkComplete={() => selected && void handleMarkComplete(selected.id)}
            onReopen={() => void handleReopen()}
            onViewCall={handleViewCall}
          />
        </section>
      </div>

      <CreateTaskDrawer
        open={drawer === 'create'}
        onClose={() => setDrawer(null)}
        onSave={(input) => void handleCreateTask(input)}
      />
      <AddNoteDrawer
        open={drawer === 'note'}
        onClose={() => setDrawer(null)}
        onSave={(note) => void handleAddNote(note)}
      />
      <AssignStaffDrawer
        open={drawer === 'assign'}
        currentTeam={drawerTask?.assignedTeam ?? 'Unassigned'}
        onClose={() => setDrawer(null)}
        onSave={(team) => void handleAssign(team)}
      />
      <RescheduleDrawer
        open={drawer === 'reschedule'}
        currentDate={drawerTask?.dueDate ?? new Date().toISOString().slice(0, 10)}
        currentTime={drawerTask?.dueTime ?? '15:00'}
        onClose={() => setDrawer(null)}
        onSave={(date, time, reason) => void handleReschedule(date, time, reason)}
      />
    </div>
  )
}
