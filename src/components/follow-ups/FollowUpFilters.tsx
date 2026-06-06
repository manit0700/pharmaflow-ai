import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ASSIGNED_TEAMS, PRIORITIES, TASK_TYPES } from './FollowUpHelpers'
import type { FollowUpFilters, PriorityTab } from '@/types/followUps'

interface FollowUpFiltersBarProps {
  filters: FollowUpFilters
  onChange: (patch: Partial<FollowUpFilters>) => void
}

const TABS: { value: PriorityTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
]

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 w-full min-w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function FollowUpFiltersBar({ filters, onChange }: FollowUpFiltersBarProps) {
  return (
    <div className="space-y-3">
      <Tabs value={filters.priorityTab} onValueChange={(v) => onChange({ priorityTab: v as PriorityTab })}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="border-border/70">
        <CardContent className="space-y-3 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search patient, phone, workflow, issue, staff, or note…"
              className="pl-9"
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              aria-label="Search follow-up tasks"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              label="Priority"
              value={filters.priority}
              onValueChange={(v) => onChange({ priority: v as FollowUpFilters['priority'] })}
              options={[
                { value: 'all', label: 'All' },
                ...PRIORITIES.map((p) => ({ value: p, label: p })),
              ]}
            />
            <FilterSelect
              label="Task type"
              value={filters.taskType}
              onValueChange={(v) => onChange({ taskType: v as FollowUpFilters['taskType'] })}
              options={[
                { value: 'all', label: 'All' },
                ...TASK_TYPES.map((t) => ({ value: t, label: t })),
              ]}
            />
            <FilterSelect
              label="Assigned staff"
              value={filters.assigned}
              onValueChange={(v) => onChange({ assigned: v as FollowUpFilters['assigned'] })}
              options={[
                { value: 'all', label: 'All' },
                ...ASSIGNED_TEAMS.map((a) => ({ value: a, label: a })),
              ]}
            />
            <FilterSelect
              label="Due date"
              value={filters.dueDate}
              onValueChange={(v) => onChange({ dueDate: v as FollowUpFilters['dueDate'] })}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'tomorrow', label: 'Tomorrow' },
                { value: 'this_week', label: 'This Week' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'all', label: 'All Time' },
              ]}
            />
            <FilterSelect
              label="Sort"
              value={filters.sort}
              onValueChange={(v) => onChange({ sort: v as FollowUpFilters['sort'] })}
              options={[
                { value: 'priority_first', label: 'Priority First' },
                { value: 'due_soon', label: 'Due Soon' },
                { value: 'newest', label: 'Newest' },
                { value: 'oldest', label: 'Oldest' },
                { value: 'recently_updated', label: 'Recently Updated' },
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
