import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  aiVsHuman,
  analyticsSeries,
  channelMix,
  completionByTemplate,
  escalationReasons,
  workflowTemplates,
} from '@/data/mockData'

export function AnalyticsPage() {
  const requestByDay = analyticsSeries.map((d) => ({
    date: d.date.slice(5),
    refill: d.refill,
    status: d.status,
    faq: d.faq,
    transfer: d.transfer,
  }))

  const escalationTrend = analyticsSeries.map((d) => ({
    date: d.date.slice(5),
    escalations: d.escalation,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Outbound campaign performance and connect rates</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI vs human resolution</CardTitle>
            <CardDescription>Share of work completed without staff</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={aiVsHuman} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                  {aiVsHuman.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel mix</CardTitle>
            <CardDescription>Voice vs SMS volume</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelMix}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Request type volume by day</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={requestByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="refill" stackId="1" stroke="#0d9488" fill="#0d9488" fillOpacity={0.4} />
                <Area type="monotone" dataKey="status" stackId="1" stroke="#0891b2" fill="#0891b2" fillOpacity={0.4} />
                <Area type="monotone" dataKey="faq" stackId="1" stroke="#64748b" fill="#64748b" fillOpacity={0.3} />
                <Area type="monotone" dataKey="transfer" stackId="1" stroke="#0e7490" fill="#0e7490" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Escalation trend (7 days)</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={escalationTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="escalations" stroke="#d97706" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Template completion rate</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completionByTemplate} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="rate" fill="#0d9488" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top escalation reasons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {escalationReasons.map((e) => (
              <div key={e.reason} className="flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-warning rounded-full"
                    style={{ width: `${(e.count / 34) * 100}%` }}
                  />
                </div>
                <span className="text-sm w-40 shrink-0">{e.reason}</span>
                <span className="text-sm font-medium">{e.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most used workflow templates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflowTemplates.map((t) => (
              <div key={t.id} className="flex justify-between border-b border-border pb-2">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
                <span className="text-sm font-semibold text-primary">{t.usageCount}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
