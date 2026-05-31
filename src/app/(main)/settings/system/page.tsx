'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Cpu,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldOff,
  WifiOff,
  Lock,
  Trash2,
} from 'lucide-react'

export default function SystemSettingsPage() {
  const router = useRouter()
  const [demoMode, setDemoMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(true)

  useEffect(() => {
    fetch('/api/settings/system')
      .then((r) => r.json())
      .then((d: { demoMode?: boolean; isAdmin?: boolean }) => {
        const demo = d.demoMode ?? false
        const admin = d.isAdmin ?? true
        setDemoMode(demo)
        setIsAdmin(admin)
        setLoading(false)
        // Demo visitors (non-admin) cannot access this page
        if (demo && !admin) router.replace('/settings/connections')
      })
      .catch(() => setLoading(false))
  }, [router])

  const handleToggle = async (value: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoMode: value }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setDemoMode(value)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      // Reload so demo mode affects the current session immediately
      setTimeout(() => window.location.reload(), 500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/system/reset', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Reset failed')
      setResetDone(true)
      setTimeout(() => setResetDone(false), 4000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setResetting(false)
    }
  }

  if (loading || (demoMode && !isAdmin)) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">System</h1>
          <p className="text-muted-foreground text-sm mt-1">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cpu className="h-6 w-6 text-primary" />
          System
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Low-level system settings. Changes take effect immediately.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Settings saved
        </div>
      )}

      {/* Demo Mode card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" />
            Demo Mode
          </CardTitle>
          <CardDescription>
            Showcase Sweeparr on a public-facing server using fake data. No real connections needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Demo Mode</p>
              <p className="text-xs text-muted-foreground">
                Seeds fake libraries and allows all features to run without Plex, Radarr, or Sonarr
              </p>
            </div>
            <Switch
              checked={demoMode}
              disabled={saving}
              onCheckedChange={handleToggle}
            />
          </div>

          {demoMode && (
            <>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1.5">
                <p className="text-sm font-semibold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Demo mode is active
                </p>
                <p className="text-xs text-amber-300/80">
                  This server is running in demo mode. All visitors share the same fake library data.
                  Each visitor gets an isolated session — clearing browser cookies resets their data.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  What&apos;s disabled in demo mode
                </p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <WifiOff className="h-3.5 w-3.5 text-muted-foreground/60" />
                    Real Plex, Radarr, and Sonarr connections are blocked
                  </li>
                  <li className="flex items-center gap-2">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                    File deletions are simulated — nothing is actually removed
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
                    Connection settings cannot be changed
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldOff className="h-3.5 w-3.5 text-muted-foreground/60" />
                    Authentication is bypassed for all visitors
                  </li>
                </ul>
              </div>

              <div className="pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  Reset all visitor sessions and re-seed demo data to its initial state.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={resetting}
                >
                  {resetting ? (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {resetDone ? 'Demo data reset!' : 'Reset Demo Data'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
