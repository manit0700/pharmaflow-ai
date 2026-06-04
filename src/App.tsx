import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LiveDemoProvider } from '@/context/LiveDemoContext'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { WorkflowBuilderPage } from '@/pages/WorkflowBuilderPage'
import { ConversationsPage } from '@/pages/ConversationsPage'
import { IntegrationsPage } from '@/pages/IntegrationsPage'
import { CompliancePage } from '@/pages/CompliancePage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { CallOperationsPage } from '@/pages/CallOperationsPage'

export default function App() {
  return (
    <BrowserRouter>
      <LiveDemoProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="workflows" element={<WorkflowBuilderPage />} />
          <Route path="calls" element={<CallOperationsPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<Navigate to="/workflows" replace />} />
        </Route>
      </Routes>
      </LiveDemoProvider>
    </BrowserRouter>
  )
}
