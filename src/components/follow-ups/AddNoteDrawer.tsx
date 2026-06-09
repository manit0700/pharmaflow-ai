import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DrawerShell } from './CreateTaskDrawer'

interface AddNoteDrawerProps {
  open: boolean
  onClose: () => void
  onSave: (note: string) => Promise<void>
}

export function AddNoteDrawer({ open, onClose, onSave }: AddNoteDrawerProps) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleSave = async () => {
    if (!note.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(note.trim())
      setNote('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save note')
    } finally {
      setSaving(false)
    }
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
            disabled={saving}
            placeholder="Left voicemail for patient."
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={!note.trim() || saving}>
            {saving ? 'Saving…' : 'Save Note'}
          </Button>
        </div>
      </div>
    </DrawerShell>
  )
}
