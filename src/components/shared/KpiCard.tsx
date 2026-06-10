import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { KPIStat } from '@/types'
import { cn } from '@/lib/utils'

export function KpiCard({ stat }: { stat: KPIStat }) {
  const Icon =
    stat.trend === 'up' ? TrendingUp : stat.trend === 'down' ? TrendingDown : Minus
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</p>
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-xs font-medium',
            stat.trend === 'up' && 'text-success',
            stat.trend === 'down' && 'text-destructive',
            stat.trend === 'neutral' && 'text-muted-foreground',
          )}
        >
          <Icon className="h-3 w-3" />
          {stat.change}
        </p>
      </CardContent>
    </Card>
  )
}
