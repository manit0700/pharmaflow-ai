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
import { formatPhoneHint, normalizePhoneInput } from '@/utils/phone'

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
  apiOffline,
  databaseOffline,
}: {
  onSubmit: (input: CreateCallJobInput) => Promise<void>
  disabled?: boolean
  apiOffline?: boolean
  databaseOffline?: boolean
}) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = <K extends keyof CreateCallJobInput>(key: K, value: CreateCallJobInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (error) setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const normalizedPhone = normalizePhoneInput(form.phoneNumber)
    if (!normalizedPhone) {
      setError('Enter a valid US phone number: 10 digits or +1 followed by 10 digits.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        ...form,
        patientName: form.patientName.trim(),
        phoneNumber: normalizedPhone,
        dob: form.dob.trim(),
        medicationName: form.medicationName.trim(),
        notes: form.notes?.trim() || '',
      })
      setForm(emptyForm())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add patient. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const phoneHint = formatPhoneHint(form.phoneNumber)

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {apiOffline && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          API is offline — run <code className="text-xs">npm run dev:pc</code> locally or check deployment health.
        </p>
      )}

      {databaseOffline && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Database is not connected. Set <code className="text-xs">DATABASE_URL</code> in{' '}
          <code className="text-xs">server/local.config.json</code> (copy from{' '}
          <code className="text-xs">server/local.config.example.json</code>), then run{' '}
          <code className="text-xs">npm run db:migrate</code> and restart the API.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="patientName">Patient name</Label>
          <Input
            id="patientName"
            placeholder="Maria Lopez"
            value={form.patientName}
            onChange={(e) => update('patientName', e.target.value)}
            required
            disabled={disabled || saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phoneNumber">Phone number</Label>
          <Input
            id="phoneNumber"
            type="tel"
            placeholder="5551234567 or +15551234567"
            value={form.phoneNumber}
            onChange={(e) => update('phoneNumber', e.target.value)}
            required
            disabled={disabled || saving}
          />
          <p className="text-[10px] text-muted-foreground">
            {phoneHint ?? '10-digit US or E.164 (+1…)'}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dob">Date of birth</Label>
          <Input
            id="dob"
            placeholder="03/15/1985"
            value={form.dob}
            onChange={(e) => update('dob', e.target.value)}
            required
            disabled={disabled || saving}
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
            disabled={disabled || saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Call reason</Label>
          <Select
            value={form.callReason}
            onValueChange={(v) => update('callReason', v as CallReasonValue)}
            disabled={disabled || saving}
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
            disabled={disabled || saving}
          />
        </div>
      </div>
      <Button type="submit" disabled={disabled || saving}>
        <Plus className="h-3.5 w-3.5" />
        {saving ? 'Adding…' : apiOffline ? 'API offline' : databaseOffline ? 'Database offline' : 'Add to call queue'}
      </Button>
    </form>
  )
}
