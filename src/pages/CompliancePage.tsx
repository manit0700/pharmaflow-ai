import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { auditEvents } from '@/data/mockData'
import { formatTime } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

const roles = [
  { role: 'Pharmacist', access: 'Full workflow + PHI review', users: 4 },
  { role: 'Technician', access: 'Refill workflows, limited PHI', users: 8 },
  { role: 'Front desk', access: 'Conversations, no export', users: 6 },
  { role: 'Admin', access: 'Integrations + audit (demo)', users: 2 },
]

export function CompliancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
        <p className="text-sm text-muted-foreground">HIPAA-oriented workflow controls — demo dashboard only</p>
      </div>

      <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="font-semibold">Demo compliance dashboard</p>
          <p className="text-muted-foreground mt-1">
            This is illustrative mock data — not a production HIPAA implementation or certification.
            Do not use for real PHI without a full compliance program.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: 'PHI redactions (7d)', value: '142', sub: 'Automated in transcripts' },
          { title: 'Consent checks', value: '98%', sub: 'Voice + SMS capture' },
          { title: 'Retention policy', value: '90 days', sub: 'Active transcripts (mock)' },
        ].map((c) => (
          <Card key={c.title}>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{c.title}</p>
              <p className="text-2xl font-semibold mt-1">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mock audit log</CardTitle>
            <CardDescription>Sensitive workflow actions — illustrative only</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3">Time</th>
                  <th className="pb-2 pr-3">Actor</th>
                  <th className="pb-2 pr-3">Action</th>
                  <th className="pb-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((e) => (
                  <tr key={e.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {formatTime(e.timestamp)}
                    </td>
                    <td className="py-2 pr-3">{e.actor}</td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant={
                          e.severity === 'critical'
                            ? 'destructive'
                            : e.severity === 'warning'
                              ? 'warning'
                              : 'secondary'
                        }
                      >
                        {e.action}
                      </Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">{e.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Illustrative access controls</CardTitle>
            <CardDescription>Role-based access mockup</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roles.map((r) => (
              <div key={r.role} className="rounded-md border border-border p-3">
                <div className="flex justify-between">
                  <p className="font-medium text-sm">{r.role}</p>
                  <Badge variant="outline">{r.users} users</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{r.access}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Retention & governance settings (demo)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="retention">Archive transcripts after 90 days</Label>
            <Switch id="retention" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="redact">Auto-redact DOB in exports</Label>
            <Switch id="redact" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="consent">Require consent before SMS</Label>
            <Switch id="consent" defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
