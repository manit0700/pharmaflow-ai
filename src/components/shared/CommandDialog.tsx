import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'

interface CommandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const routes = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Call Recordings', path: '/calls' },
  { label: 'Call flow', path: '/workflows' },
  { label: 'Call history', path: '/conversations' },
  { label: 'Integrations', path: '/integrations' },
  { label: 'Audit log', path: '/compliance' },
  { label: 'Analytics', path: '/analytics' },
]

export function CommandDialog({ open, onOpenChange }: CommandDialogProps) {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[20vh] px-4"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command search"
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Input placeholder="Jump to page…" autoFocus className="mb-3" />
        <ul className="max-h-64 overflow-auto">
          {routes.map((r) => (
            <li key={r.path}>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => {
                  navigate(r.path)
                  onOpenChange(false)
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Press Esc to close · ⌘K to toggle</p>
      </div>
    </div>
  )
}
