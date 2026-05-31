'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'

const BREADCRUMB_MAP: Record<string, string> = {
  '': 'Dashboard',
  libraries: 'Libraries',
  activity: 'Activity',
  reports: 'Reports',
  cleanup: 'Cleanup',
  settings: 'Settings',
  connections: 'Connections',
  rules: 'Rules',
  schedule: 'Schedule',
  notifications: 'Notifications',
  appearance: 'Appearance',
  auth: 'Auth',
}

export default function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [authEnabled, setAuthEnabled] = useState(false)
  const [executingCount, setExecutingCount] = useState(0)
  const executingPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchExecutingCount = () => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((data: Array<{ status: string }>) => {
        if (Array.isArray(data)) {
          setExecutingCount(data.filter((r) => r.status === 'EXECUTING').length)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/api/settings/auth')
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => setAuthEnabled(d.enabled))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchExecutingCount()
    executingPollRef.current = setInterval(fetchExecutingCount, 3000)
    return () => {
      if (executingPollRef.current) clearInterval(executingPollRef.current)
    }
  }, [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }
  const segments = pathname.split('/').filter(Boolean)

  const crumbs = [
    { label: 'Dashboard', href: '/' },
    ...segments.map((seg, i) => ({
      label: BREADCRUMB_MAP[seg] ?? seg,
      href: '/' + segments.slice(0, i + 1).join('/'),
    })),
  ]

  return (
    <header className="flex h-14 items-center border-b border-border bg-background/80 backdrop-blur-sm px-4 gap-2 sticky top-0 z-10">
      <nav className="flex flex-1 items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            {i < crumbs.length - 1 ? (
              <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
      {executingCount > 0 && (
        <Link
          href="/reports"
          className="flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors shrink-0"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
          </span>
          {executingCount}
        </Link>
      )}
      {authEnabled && (
        <Button variant="ghost" size="icon" onClick={logout} title="Log out" className="h-8 w-8 shrink-0">
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}
    </header>
  )
}
