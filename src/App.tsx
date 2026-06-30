import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { CallFlowPage } from '@/pages/CallFlowPage'
import { ConversationsPage } from '@/pages/ConversationsPage'
import { IntegrationsPage } from '@/pages/IntegrationsPage'
import { CompliancePage } from '@/pages/CompliancePage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { CallOperationsPage } from '@/pages/CallOperationsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PatientsPage } from '@/pages/PatientsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="workflows" element={<CallFlowPage />} />
          <Route path="calls" element={<CallOperationsPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
