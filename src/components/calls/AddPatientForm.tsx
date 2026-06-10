import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CALL_REASONS, type CallReasonValue } from '@/constants/callReasons'
import type { CreateCallJobInput } from '@/utils/api'

const emptyForm = (): CreateCallJobInput => ({
  patientName: '',
  phoneNumber: '',
  dob: '',
  medicationName: '',
  callReason: 'refill_reminder',
  notes: '',
})

export function AddPatientForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (input: CreateCallJobInput) => Promise<void>
  disabled?: boolean
}) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const update = <K extends keyof CreateCallJobInput>(key: K, value: CreateCallJobInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit(form)
      setForm(emptyForm())
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="patientName">Patient name</Label>
          <Input
            id="patientName"
            placeholder="Maria Lopez"
            value={form.patientName}
            onChange={(e) => update('patientName', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phoneNumber">Phone number</Label>
          <Input
            id="phoneNumber"
            type="tel"
            placeholder="+1 555 123 4567"
            value={form.phoneNumber}
            onChange={(e) => update('phoneNumber', e.target.value)}
            required
          />
          <p className="text-[10px] text-muted-foreground">10-digit US or E.164 (+1…)</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dob">Date of birth</Label>
          <Input
            id="dob"
            placeholder="03/15/1985"
            value={form.dob}
            onChange={(e) => update('dob', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="medicationName">Medication</Label>
          <Input
            id="medicationName"
            placeholder="Lisinopril 10mg"
            value={form.medicationName}
            onChange={(e) => update('medicationName', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Call reason</Label>
          <Select
            value={form.callReason}
            onValueChange={(v) => update('callReason', v as CallReasonValue)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select reason" />
            </SelectTrigger>
            <SelectContent>
              {CALL_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            rows={2}
            placeholder="Pickup window, insurance note, preferred language…"
            value={form.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={disabled || saving}>
        <Plus className="h-3.5 w-3.5" />
        {saving ? 'Adding…' : 'Add to call queue'}
      </Button>
    </form>
  )
}
