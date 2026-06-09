import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ASSIGNED_TEAMS } from './FollowUpHelpers'
import type { AssignedTeam } from '@/types/followUps'
import { DrawerShell } from './CreateTaskDrawer'

interface AssignStaffDrawerProps {
  open: boolean
  currentTeam: AssignedTeam
  onClose: () => void
  onSave: (team: AssignedTeam) => Promise<void>
}

export function AssignStaffDrawer({ open, currentTeam, onClose, onSave }: AssignStaffDrawerProps) {
  const [team, setTeam] = useState<AssignedTeam>(currentTeam)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTeam(currentTeam)
      setError(null)
    }
  }, [open, currentTeam])

  if (!open) return null

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(team)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save assignment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DrawerShell title="Assign Staff" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Assign to</Label>
          <Select value={team} onValueChange={(v) => setTeam(v as AssignedTeam)} disabled={saving}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSIGNED_TEAMS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save Assignment'}
          </Button>
        </div>
      </div>
    </DrawerShell>
  )
}
