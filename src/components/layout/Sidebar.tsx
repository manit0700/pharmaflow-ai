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
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFollowUpContext } from '@/context/FollowUpContext'
import { useAppHealth } from '@/hooks/useAppHealth'
import { Badge } from '@/components/ui/badge'

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calls', icon: Phone, label: 'Calls' },
  { to: '/follow-ups', icon: ClipboardList, label: 'Follow-Ups', showCount: true },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/conversations', icon: MessageSquare, label: 'Call History' },
  { to: '/workflows', icon: GitBranch, label: 'Call Flow' },
  { to: '/integrations', icon: Plug, label: 'Integrations' },
  { to: '/compliance', icon: Shield, label: 'Audit Log' },
]

export function Sidebar() {
  const { openCount } = useFollowUpContext()
  const { health, dbConnected, dbLabel } = useAppHealth()

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">PharmaFlow AI</p>
          <p className="text-[10px] text-muted-foreground">Pharmacy operations</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {nav.map(({ to, icon: Icon, label, showCount }) => (
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
            <span className="flex-1">{label}</span>
            {showCount && openCount > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
                aria-label={`${openCount} open follow-ups`}
              >
                {openCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-4 space-y-2">
        {health?.ok ? (
          <Badge variant={dbConnected ? 'success' : 'warning'} className="text-[10px]">
            {dbConnected ? `${dbLabel} connected` : 'Database check needed'}
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-[10px]">
            API offline
          </Badge>
        )}
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Outbound calls, follow-ups, and owner analytics from live production data.
        </p>
      </div>
    </aside>
  )
}
