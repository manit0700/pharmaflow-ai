import { Bell, Moon, Search, Sun, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { notifications } from '@/data/mockData'
import { useLiveDemo } from '@/context/LiveDemoContext'

interface HeaderProps {
  dark: boolean
  onToggleTheme: () => void
  onOpenCommand: () => void
}

export function Header({ dark, onToggleTheme, onOpenCommand }: HeaderProps) {
  const { isLive, startDemo, stopDemo } = useLiveDemo()
  const unread = notifications.filter((n) => !n.read).length

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
      <div className="relative hidden flex-1 max-w-md sm:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search workflows, patients… (⌘K)"
          className="pl-9"
          onFocus={onOpenCommand}
          readOnly
        />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant={isLive ? 'destructive' : 'default'}
          className="hidden sm:inline-flex"
          onClick={isLive ? stopDemo : startDemo}
        >
          {isLive ? 'Stop live demo' : 'Live demo'}
        </Button>
        <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Toggle theme">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {unread}
            </span>
          )}
        </Button>
        <Button variant="ghost" size="icon" aria-label="User menu">
          <User className="h-4 w-4" />
        </Button>
        <Badge variant="secondary" className="hidden lg:inline-flex">
          Demo Admin
        </Badge>
      </div>
    </header>
  )
}
