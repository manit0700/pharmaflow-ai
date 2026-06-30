import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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

interface RxRow {
  name: string
  cost: string
}

interface FormState extends CreateCallJobInput {
  additionalRx: RxRow[]
}

const emptyForm = (): FormState => ({
  patientName: '',
  phoneNumber: '',
  dob: '',
  medicationName: '',
  callReason: 'refill_reminder',
  notes: '',
  prescriptionCost: null,
  prescriptionsJson: null,
  additionalRx: [],
})

function buildPrescriptionsJson(
  medicationName: string,
  primaryCost: number | null,
  additionalRx: RxRow[],
): { prescriptionsJson: string | null; prescriptionCost: number | null } {
  const all: Array<{ name: string; cost: number }> = []
  if (medicationName.trim()) all.push({ name: medicationName.trim(), cost: primaryCost ?? 0 })
  for (const row of additionalRx) {
    const name = row.name.trim()
    if (!name) continue
    all.push({ name, cost: parseFloat(row.cost) || 0 })
  }
  if (all.length === 0) return { prescriptionsJson: null, prescriptionCost: null }
  const totalCost = all.some((p) => p.cost > 0) ? all.reduce((s, p) => s + p.cost, 0) : null
  return { prescriptionsJson: JSON.stringify(all), prescriptionCost: totalCost }
}

export function AddPatientForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (input: CreateCallJobInput) => Promise<void>
  disabled?: boolean
}) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const addRxRow = () => {
    setForm((f) => ({ ...f, additionalRx: [...f.additionalRx, { name: '', cost: '' }] }))
  }

  const updateRxRow = (index: number, field: keyof RxRow, value: string) => {
    setForm((f) => {
      const rows = [...f.additionalRx]
      rows[index] = { ...rows[index]!, [field]: value }
      return { ...f, additionalRx: rows }
    })
  }

  const removeRxRow = (index: number) => {
    setForm((f) => ({ ...f, additionalRx: f.additionalRx.filter((_, i) => i !== index) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { prescriptionsJson, prescriptionCost } = buildPrescriptionsJson(
        form.medicationName,
        form.prescriptionCost ?? null,
        form.additionalRx,
      )
      await onSubmit({ ...form, prescriptionsJson, prescriptionCost })
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
            placeholder="Patient full name"
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
            placeholder="9403687508 or +19403687508"
            value={form.phoneNumber}
            onChange={(e) => update('phoneNumber', e.target.value)}
            onBlur={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              if (digits.length === 10) update('phoneNumber', `+1${digits}`)
              else if (digits.length === 11 && digits.startsWith('1')) update('phoneNumber', `+${digits}`)
            }}
            required
          />
          <p className="text-[10px] text-muted-foreground">10-digit US number — +1 added automatically</p>
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

      {/* Prescriptions section */}
      <div className="space-y-2">
        <Label>Prescriptions</Label>

        {/* Primary prescription row */}
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Medication name (e.g. Lisinopril 10mg)"
            value={form.medicationName}
            onChange={(e) => update('medicationName', e.target.value)}
            required
            className="flex-1"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Cost $"
            value={form.prescriptionCost ?? ''}
            onChange={(e) => update('prescriptionCost', e.target.value ? parseFloat(e.target.value) : null)}
            className="w-28"
          />
          <Button type="button" size="sm" variant="outline" onClick={addRxRow}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Rx
          </Button>
        </div>

        {/* Additional prescription rows */}
        {form.additionalRx.map((rx, i) => (
          <div key={i} className="flex gap-2 items-center pl-4 border-l-2 border-border">
            <Input
              placeholder="Medication name"
              value={rx.name}
              onChange={(e) => updateRxRow(i, 'name', e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Cost $"
              value={rx.cost}
              onChange={(e) => updateRxRow(i, 'cost', e.target.value)}
              className="w-28"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => removeRxRow(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {form.additionalRx.length > 0 && (
          <p className="text-[10px] text-muted-foreground pl-4">
            Total: {form.additionalRx.length + 1} prescription{form.additionalRx.length > 0 ? 's' : ''}
            {(() => {
              const primary = form.prescriptionCost ?? 0
              const extra = form.additionalRx.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0)
              const total = primary + extra
              return total > 0 ? ` · $${total.toFixed(2)} total` : ''
            })()}
          </p>
        )}
      </div>

      <Button type="submit" disabled={disabled || saving}>
        <Plus className="h-3.5 w-3.5" />
        {saving ? 'Adding…' : 'Add to call queue'}
      </Button>
    </form>
  )
}
