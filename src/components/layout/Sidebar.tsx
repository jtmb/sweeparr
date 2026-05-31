'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Library,
  FileText,
  Trash2,
  Activity,
  Settings,
  Tv,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ScrollText,
  Database,
  ShieldBan,
  Cpu,
  FlaskConical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/libraries', label: 'Libraries', icon: Library },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/exclusions', label: 'Exclusions', icon: ShieldBan },
  { href: '/cleanup', label: 'Cleanup', icon: Trash2 },
]

const SETTINGS_ITEMS = [
  { href: '/settings/connections', label: 'Connections', icon: Settings },
  { href: '/settings/rules', label: 'Rules', icon: FileText },
  { href: '/settings/schedule', label: 'Schedule', icon: Activity },
  { href: '/settings/notifications', label: 'Notifications', icon: Tv },
  { href: '/settings/backups', label: 'Backups', icon: Database },
  { href: '/settings/logs', label: 'Logs', icon: ScrollText },
  { href: '/settings/appearance', label: 'Appearance', icon: Settings },
  { href: '/settings/auth', label: 'Auth', icon: ShieldCheck },
  { href: '/settings/system', label: 'System', icon: Cpu },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [isAdmin, setIsAdmin] = useState(true)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  useEffect(() => {
    fetch('/api/settings/system')
      .then((r) => r.json())
      .then((d: { demoMode?: boolean; isAdmin?: boolean }) => {
        setDemoMode(d.demoMode ?? false)
        setIsAdmin(d.isAdmin ?? true)
      })
      .catch(() => {})
  }, [])

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r border-border bg-sidebar transition-all duration-200',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo */}
          <div className={cn('flex items-center pl-4 pr-0 py-3 border-b border-border', collapsed && 'justify-center px-0')}>
            <div className={cn('flex items-center justify-start', collapsed ? 'h-8' : 'h-14')}>
              <img
                src="/assets/logo.svg"
                alt="SWEEPARR"
                className={cn(collapsed ? 'h-6 w-6' : 'h-12 w-auto')}
                style={{ maxWidth: 380, display: 'block', marginLeft: 0, marginRight: 0 }}
              />
            </div>
          </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-0.5 pl-2 pr-0">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md pl-2 pr-0 py-2 text-sm transition-colors',
                isActive(href)
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                collapsed && 'justify-center'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          ))}
        </div>

        {/* Settings section */}
        <div className="mt-6 pl-2 pr-0">
            {!collapsed && (
            <p className="mb-1 pl-2 pr-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Settings
            </p>
          )}
          <div className="space-y-0.5">
            {SETTINGS_ITEMS.filter(({ href }) => {
              // Hide System settings from demo visitors (non-admin)
              if (href === '/settings/system' && demoMode && !isAdmin) return false
              return true
            }).map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md pl-2 pr-0 py-2 text-sm transition-colors',
                  isActive(href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  collapsed && 'justify-center'
                )}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            ))}
          </div>
        </div>

      {/* Demo mode banner */}
      {demoMode && (
        <div className={cn(
          'mx-2 mb-1 rounded flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 px-2 py-1.5',
          collapsed && 'justify-center px-0 mx-1'
        )}>
          <FlaskConical className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          {!collapsed && (
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
              Demo Mode
            </span>
          )}
        </div>
      )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center border-t border-border p-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  )
}
