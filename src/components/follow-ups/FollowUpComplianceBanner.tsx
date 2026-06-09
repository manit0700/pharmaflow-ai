import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Shield, Lock, Database, Users } from 'lucide-react'
import type { FollowUpDataSource } from '@/context/FollowUpContext'

export function FollowUpComplianceBanner({ dataSource }: { dataSource?: FollowUpDataSource }) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm">
            <strong>Staff-only workflow.</strong> Follow-up activity may contain protected health information and
            should be accessed only by authorized pharmacy staff.
          </p>
          {dataSource === 'api' && (
            <Badge variant="success">Live task queue</Badge>
          )}
          {dataSource === 'offline' && (
            <Badge variant="destructive">API unavailable</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Shield className="h-3 w-3" aria-hidden />
            PHI Protected
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Lock className="h-3 w-3" aria-hidden />
            Access Logged
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Database className="h-3 w-3" aria-hidden />
            Postgres Backed
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" aria-hidden />
            Staff Workflow
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Patient details are masked in lists where possible. All staff actions are logged for compliance review.
        </p>
      </CardContent>
    </Card>
  )
}
