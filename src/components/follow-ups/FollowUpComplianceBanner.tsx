import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Shield, Lock, Database, Users } from 'lucide-react'

export function FollowUpComplianceBanner() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <p className="text-sm">
          <strong>Demo data only.</strong> Do not use real patient information in this environment. Follow-up
          activity may contain PHI in production and should be accessed only by authorized pharmacy staff.
        </p>
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
            Demo Data
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" aria-hidden />
            Staff Workflow
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          This page uses demo data only. In production, follow-up tasks may include protected health information
          and should require authentication, role-based access, audit logging, and patient consent controls.
        </p>
      </CardContent>
    </Card>
  )
}
