import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DrawerShell } from './CreateTaskDrawer'

interface RescheduleDrawerProps {
  open: boolean
  currentDate: string
  currentTime: string
  onClose: () => void
  onSave: (date: string, time: string, reason: string) => Promise<void>
}

export function RescheduleDrawer({ open, currentDate, currentTime, onClose, onSave }: RescheduleDrawerProps) {
  const [date, setDate] = useState(currentDate)
  const [time, setTime] = useState(currentTime)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      setDate(currentDate)
      setTime(currentTime)
      setReason('')
      setError(null)
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, currentDate, currentTime])

  if (!open) return null

  const handleSave = async () => {
    if (!reason.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(date, time, reason.trim())
      setReason('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save reschedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DrawerShell title="Reschedule Callback" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>New date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label>New time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={saving} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={saving}
            placeholder="Patient requested callback tomorrow after 2 PM."
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={!reason.trim() || saving}>
            {saving ? 'Saving…' : 'Save Reschedule'}
          </Button>
        </div>
      </div>
    </DrawerShell>
  )
}
