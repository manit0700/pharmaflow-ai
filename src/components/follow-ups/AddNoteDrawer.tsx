import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DrawerShell } from './CreateTaskDrawer'

interface AddNoteDrawerProps {
  open: boolean
  onClose: () => void
  onSave: (note: string) => void
}

export function AddNoteDrawer({ open, onClose, onSave }: AddNoteDrawerProps) {
  const [note, setNote] = useState('')

  if (!open) return null

  const handleSave = () => {
    if (!note.trim()) return
    onSave(note.trim())
    setNote('')
    onClose()
  }

  return (
    <DrawerShell title="Add Note" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="follow-up-note">Note</Label>
          <Textarea
            id="follow-up-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Left voicemail for patient."
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!note.trim()}>Save Note</Button>
        </div>
      </div>
    </DrawerShell>
  )
}
