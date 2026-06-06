import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchAnalytics, type AnalyticsResponse } from '@/utils/api'
import { Skeleton } from '@/components/ui/skeleton'

const emptyAnalytics: AnalyticsResponse = {
  totalJobs: 0,
  attempted: 0,
  completed: 0,
  escalated: 0,
  withPatientResponse: 0,
  byReason: [],
  byStatus: [],
  series: [],
  aiVsHuman: [],
  channelMix: [],
  completionByReason: [],
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse>(emptyAnalytics)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
      .then(setData)
      .catch(() => setData(emptyAnalytics))
      .finally(() => setLoading(false))
    const id = setInterval(() => {
      fetchAnalytics().then(setData).catch(() => {})
    }, 15000)
    return () => clearInterval(id)
  }, [])

  const series = data.series.map((d) => ({
    date: d.date.slice(5),
    calls: d.calls,
    completed: d.completed,
    escalations: d.escalations,
  }))

  const pieData = data.aiVsHuman.filter((d) => d.value > 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Live stats from your call queue — {data.totalJobs} jobs, {data.attempted} dialed
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total patients', value: data.totalJobs },
          { label: 'Calls attempted', value: data.attempted },
          { label: 'Patient answers', value: data.withPatientResponse },
          { label: 'Staff follow-ups', value: data.escalated },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.totalJobs === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No call data yet. Add patients on the dashboard and place outbound calls to see analytics.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Resolution mix</CardTitle>
              <CardDescription>Answers captured vs staff follow-up</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground pt-8 text-center">No completed calls yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calls by reason</CardTitle>
              <CardDescription>Distribution of outbound call types</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.completionByReason}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="reason" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#6366f1" name="Total" />
                  <Bar dataKey="completed" fill="#22c55e" name="With answer" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {series.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Activity over time</CardTitle>
                <CardDescription>Jobs created and completed per day</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="calls" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} name="Jobs" />
                    <Area type="monotone" dataKey="completed" stackId="2" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} name="Answered" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
