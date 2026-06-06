import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Moon, Search, Sun, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { fetchTasks, type StaffTask } from '@/utils/api'
import { useFollowUpContext } from '@/context/FollowUpContext'

interface HeaderProps {
  dark: boolean
  onToggleTheme: () => void
  onOpenCommand: () => void
}

export function Header({ dark, onToggleTheme, onOpenCommand }: HeaderProps) {
  const { openCount } = useFollowUpContext()
  const [tasks, setTasks] = useState<StaffTask[]>([])

  useEffect(() => {
    const load = () => {
      fetchTasks()
        .then(setTasks)
        .catch(() => setTasks([]))
    }
    load()
    const id = setInterval(load, 12000)
    return () => clearInterval(id)
  }, [])

  const apiOpenTasks = tasks.filter((t) => t.status === 'open')
  const bellCount = openCount > 0 ? openCount : apiOpenTasks.length

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
      <div className="relative hidden flex-1 max-w-md sm:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search patients, pages… (⌘K)"
          className="pl-9"
          onFocus={onOpenCommand}
          readOnly
        />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Toggle theme">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="relative" asChild aria-label="Staff follow-ups">
          <Link to="/follow-ups">
            <Bell className="h-4 w-4" />
            {bellCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {bellCount}
              </span>
            )}
          </Link>
        </Button>
        <Button variant="ghost" size="icon" aria-label="User menu">
          <User className="h-4 w-4" />
        </Button>
        <Badge variant="secondary" className="hidden lg:inline-flex">
          Pharmacy staff
        </Badge>
      </div>
    </header>
  )
}
