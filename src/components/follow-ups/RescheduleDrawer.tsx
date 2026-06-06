import { useState } from 'react'
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
  onSave: (date: string, time: string, reason: string) => void
}

export function RescheduleDrawer({ open, currentDate, currentTime, onClose, onSave }: RescheduleDrawerProps) {
  const [date, setDate] = useState(currentDate)
  const [time, setTime] = useState(currentTime)
  const [reason, setReason] = useState('')

  if (!open) return null

  const handleSave = () => {
    if (!reason.trim()) return
    onSave(date, time, reason.trim())
    setReason('')
    onClose()
  }

  return (
    <DrawerShell title="Reschedule Callback" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>New date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>New time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Patient requested callback tomorrow after 2 PM."
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!reason.trim()}>Save Reschedule</Button>
        </div>
      </div>
    </DrawerShell>
  )
}
