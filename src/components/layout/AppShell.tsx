import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useTheme } from '@/hooks/useTheme'
import { CommandDialog } from '@/components/shared/CommandDialog'
import { LiveDemoBar } from '@/components/demo/LiveDemoBar'

export function AppShell() {
  const { dark, toggle } = useTheme()
  const [commandOpen, setCommandOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          dark={dark}
          onToggleTheme={toggle}
          onOpenCommand={() => setCommandOpen(true)}
        />
        <LiveDemoBar />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet context={{ toast }} />
        </main>
      </div>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  )
}
