import { useState } from 'react'
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
  onSave: (team: AssignedTeam) => void
}

export function AssignStaffDrawer({ open, currentTeam, onClose, onSave }: AssignStaffDrawerProps) {
  const [team, setTeam] = useState<AssignedTeam>(currentTeam)

  if (!open) return null

  const handleSave = () => {
    onSave(team)
    onClose()
  }

  return (
    <DrawerShell title="Assign Staff" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Assign to</Label>
          <Select value={team} onValueChange={(v) => setTeam(v as AssignedTeam)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSIGNED_TEAMS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Assignment</Button>
        </div>
      </div>
    </DrawerShell>
  )
}
