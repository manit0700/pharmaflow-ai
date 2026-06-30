import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  GitBranch,
  MessageSquare,
  Plug,
  Shield,
  BarChart3,
  Activity,
  Phone,
  Settings,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/patients', icon: Users, label: 'Patients' },
  { to: '/calls', icon: Phone, label: 'Call Recordings' },
  { to: '/workflows', icon: GitBranch, label: 'Call flow' },
  { to: '/conversations', icon: MessageSquare, label: 'Call history' },
  { to: '/integrations', icon: Plug, label: 'Integrations' },
  { to: '/compliance', icon: Shield, label: 'Audit log' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">PharmaFlow AI</p>
          <p className="text-[10px] text-muted-foreground">Outbound pharmacy calls</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-accent-fg'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-4">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Live on your PC API. Change phone numbers in Settings.
        </p>
      </div>
    </aside>
  )
}
