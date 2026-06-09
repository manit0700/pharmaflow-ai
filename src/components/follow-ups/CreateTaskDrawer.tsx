import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ASSIGNED_TEAMS, PRIORITIES, TASK_TYPES } from './FollowUpHelpers'
import type { CreateTaskInput } from '@/types/followUps'

interface CreateTaskDrawerProps {
  open: boolean
  onClose: () => void
  onSave: (input: CreateTaskInput) => void
}

export function CreateTaskDrawer({ open, onClose, onSave }: CreateTaskDrawerProps) {
  const [patientMasked, setPatientMasked] = useState('')
  const [phoneMasked, setPhoneMasked] = useState('')
  const [taskType, setTaskType] = useState<CreateTaskInput['taskType']>('Callback')
  const [priority, setPriority] = useState<CreateTaskInput['priority']>('Medium')
  const [assignedTeam, setAssignedTeam] = useState<CreateTaskInput['assignedTeam']>('Unassigned')
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueTime, setDueTime] = useState('15:00')
  const [issueSummary, setIssueSummary] = useState('')
  const [notes, setNotes] = useState('')

  if (!open) return null

  const handleSave = () => {
    if (!patientMasked.trim() || !phoneMasked.trim() || !issueSummary.trim()) return
    onSave({
      patientMasked: patientMasked.trim(),
      phoneMasked: phoneMasked.trim(),
      taskType,
      priority,
      assignedTeam,
      dueDate,
      dueTime,
      issueSummary: issueSummary.trim(),
      notes: notes.trim() || undefined,
    })
    setPatientMasked('')
    setPhoneMasked('')
    setIssueSummary('')
    setNotes('')
    onClose()
  }

  return (
    <DrawerShell title="Create Follow-Up Task" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Patient name (masked)">
          <Input value={patientMasked} onChange={(e) => setPatientMasked(e.target.value)} placeholder="Maria G." />
        </Field>
        <Field label="Phone (masked)">
          <Input value={phoneMasked} onChange={(e) => setPhoneMasked(e.target.value)} placeholder="(***) ***-4821" />
        </Field>
        <Field label="Task type">
          <Select value={taskType} onValueChange={(v) => setTaskType(v as CreateTaskInput['taskType'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={priority} onValueChange={(v) => setPriority(v as CreateTaskInput['priority'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Assigned staff/team">
          <Select value={assignedTeam} onValueChange={(v) => setAssignedTeam(v as CreateTaskInput['assignedTeam'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSIGNED_TEAMS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Due time">
            <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Issue summary">
          <Textarea value={issueSummary} onChange={(e) => setIssueSummary(e.target.value)} rows={3} />
        </Field>
        <Field label="Notes (optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!patientMasked.trim() || !phoneMasked.trim() || !issueSummary.trim()}
          >
            Save Task
          </Button>
        </div>
      </div>
    </DrawerShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function DrawerShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-xl border border-border bg-card p-5 shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export { DrawerShell }
