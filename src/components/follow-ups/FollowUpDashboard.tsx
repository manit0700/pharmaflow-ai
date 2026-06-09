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
  createTaskFromInput,
  exportQueueJson,
  filterAndSortTasks,
} from './FollowUpHelpers'
import type { AssignedTeam, CreateTaskInput, FollowUpFilters, FollowUpPriority } from '@/types/followUps'
import { mapPriorityToApi } from '@/utils/staffTaskMapper'

type DrawerMode = 'create' | 'note' | 'assign' | 'reschedule' | null

export function FollowUpDashboard() {
  const { tasks, applyTaskUpdate, addTask, loading, error, refresh, dataSource, savingTaskId } =
    useFollowUpContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FollowUpFilters>({
    search: '',
    priorityTab: 'all',
    status: 'all',
    priority: 'all',
    taskType: 'all',
    assigned: 'all',
    dueDate: 'all',
    createdFromCall: 'all',
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
  const isSavingSelected = selected ? savingTaskId === selected.id : false

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
    await applyTaskUpdate(drawerTask.id, { appendNote: note })
    toast.success('Note added')
  }

  const handleAssign = async (team: AssignedTeam) => {
    if (!drawerTask) return
    await applyTaskUpdate(drawerTask.id, { assignedTeam: team })
    toast.success(`Assigned to ${team}`)
  }

  const handleReschedule = async (date: string, time: string, _reason: string) => {
    if (!drawerTask) return
    await applyTaskUpdate(drawerTask.id, { dueDate: date, dueTime: time })
    toast.success('Callback rescheduled')
  }

  const handleMarkComplete = async (taskId: string) => {
    await applyTaskUpdate(taskId, { status: 'completed' })
    toast.success('Task completed')
  }

  const handleCancelTask = async () => {
    if (!selected) return
    const ok = window.confirm('Cancel this follow-up task? This will stop active work on it.')
    if (!ok) return
    await applyTaskUpdate(selected.id, { status: 'cancelled' })
    toast.success('Task cancelled')
  }

  const handleReopen = async () => {
    if (!selected) return
    await applyTaskUpdate(selected.id, { status: 'open' })
    toast.success('Task reopened')
  }

  const handleStartTask = async () => {
    if (!selected) return
    await applyTaskUpdate(selected.id, { status: 'in_progress' })
    toast.success('Task marked in progress')
  }

  const handlePriorityChange = async (priority: FollowUpPriority) => {
    if (!selected) return
    await applyTaskUpdate(selected.id, { priority: mapPriorityToApi(priority) })
    toast.success(`Priority set to ${priority}`)
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
            saving={isSavingSelected}
            onStartTask={() => void handleStartTask()}
            onAssign={() => openDrawer('assign')}
            onAddNote={() => openDrawer('note')}
            onReschedule={() => openDrawer('reschedule')}
            onMarkComplete={() => selected && void handleMarkComplete(selected.id)}
            onCancelTask={() => void handleCancelTask()}
            onReopen={() => void handleReopen()}
            onViewCall={handleViewCall}
            onPriorityChange={(p) => void handlePriorityChange(p)}
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
        onSave={(note) => handleAddNote(note)}
      />
      <AssignStaffDrawer
        open={drawer === 'assign'}
        currentTeam={drawerTask?.assignedTeam ?? 'Unassigned'}
        onClose={() => setDrawer(null)}
        onSave={(team) => handleAssign(team)}
      />
      <RescheduleDrawer
        open={drawer === 'reschedule'}
        currentDate={drawerTask?.dueDate ?? new Date().toISOString().slice(0, 10)}
        currentTime={drawerTask?.dueTime ?? '15:00'}
        onClose={() => setDrawer(null)}
        onSave={(date, time, reason) => handleReschedule(date, time, reason)}
      />
    </div>
  )
}
