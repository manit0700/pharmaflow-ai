import {
  AlertCircle,
  ClipboardList,
  Clock,
  PhoneCall,
  Stethoscope,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SummaryMetrics {
  open: number
  urgent: number
  inProgress: number
  completedToday: number
  callbacks: number
  pharmacistReview: number
}

interface FollowUpSummaryCardsProps {
  metrics: SummaryMetrics
}

function MetricCard({
  icon,
  label,
  value,
  trend,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  trend: string
  accent?: string
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-accent-fg', accent)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="mt-1 text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{trend}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function FollowUpSummaryCards({ metrics }: FollowUpSummaryCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        icon={<ClipboardList className="h-4 w-4" />}
        label="Open Tasks"
        value={String(metrics.open)}
        trend="Needs staff action"
      />
      <MetricCard
        icon={<AlertCircle className="h-4 w-4" />}
        label="Urgent Tasks"
        value={String(metrics.urgent)}
        trend="Priority attention"
        accent="bg-destructive/10 text-destructive"
      />
      <MetricCard
        icon={<Clock className="h-4 w-4" />}
        label="In Progress"
        value={String(metrics.inProgress)}
        trend="Currently being worked"
      />
      <MetricCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Completed Today"
        value={String(metrics.completedToday)}
        trend="Resolved today"
        accent="bg-success/10 text-success"
      />
      <MetricCard
        icon={<PhoneCall className="h-4 w-4" />}
        label="Callback Requests"
        value={String(metrics.callbacks)}
        trend="Patient callbacks pending"
      />
      <MetricCard
        icon={<Stethoscope className="h-4 w-4" />}
        label="Pharmacist Review"
        value={String(metrics.pharmacistReview)}
        trend="Clinical review needed"
      />
    </div>
  )
}
