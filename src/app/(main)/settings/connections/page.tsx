'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, RefreshCw, Server, LogIn, LogOut, RotateCcw } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface PlexServer { name: string; url: string; local: boolean }

interface ConnectionState {
  plexUrl: string
  plexToken: string
  radarrUrl: string
  radarrApiKey: string
  sonarrUrl: string
  sonarrApiKey: string
}

interface TestResult {
  ok: boolean
  version?: string
  name?: string
  error?: string
}

export default function ConnectionsPage() {
  const [cfg, setCfg] = useState<ConnectionState>({
    plexUrl: '', plexToken: '', radarrUrl: '', radarrApiKey: '', sonarrUrl: '', sonarrApiKey: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  const [plexAuthState, setPlexAuthState] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle')
  const [plexAuthError, setPlexAuthError] = useState<string | null>(null)
  const [plexServers, setPlexServers] = useState<PlexServer[]>([])
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.connections) {
          setCfg((prev) => ({
            ...prev,
            plexUrl: d.connections.plexUrl ?? '',
            plexToken: d.connections.plexToken ? '***' : '',
            radarrUrl: d.connections.radarrUrl ?? '',
            radarrApiKey: d.connections.radarrApiKey ?? '',
            sonarrUrl: d.connections.sonarrUrl ?? '',
            sonarrApiKey: d.connections.sonarrApiKey ?? '',
          }))
          if (d.connections.plexToken) setPlexAuthState('success')
        }
      })
      .catch(() => {})
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  const startPlexAuth = async () => {
    setPlexAuthState('waiting')
    setPlexAuthError(null)
    try {
      const res = await fetch('/api/plex/auth', { method: 'POST' })
      const { pinId, authUrl, error } = await res.json()
      if (error) throw new Error(error)
      window.open(authUrl, '_blank', 'noopener,noreferrer')
      let attempts = 0
      const MAX = 60
      const poll = async () => {
        if (attempts++ >= MAX) {
          setPlexAuthState('error')
          setPlexAuthError('Timed out waiting for Plex sign-in')
          return
        }
        const r = await fetch(`/api/plex/auth?pinId=${pinId}`)
        const data = await r.json()
        if (data.authenticated) {
          const servers: PlexServer[] = data.servers ?? []
          // bestUrl = first server that responded to /identity (probed server-side)
          // fall back to local → first in list if probe found nothing
          const autoUrl =
            data.bestUrl ??
            servers.find((s) => s.local)?.url ??
            servers[0]?.url ??
            ''
          setCfg((p) => ({ ...p, plexToken: data.token, plexUrl: autoUrl }))
          setPlexServers(servers)
          setPlexAuthState('success')
          // Auto-run connection test with the freshly resolved URL + token
          setTesting((p) => ({ ...p, plex: true }))
          setTestResults((p) => ({ ...p, plex: undefined as unknown as TestResult }))
          fetch('/api/settings/test/plex', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plexUrl: autoUrl, plexToken: data.token }),
          })
            .then((r) => r.json())
            .then((d) => setTestResults((p) => ({ ...p, plex: d })))
            .catch(() => setTestResults((p) => ({ ...p, plex: { ok: false, error: 'Test failed' } })))
            .finally(() => setTesting((p) => ({ ...p, plex: false })))
        } else {
          pollRef.current = setTimeout(poll, 2000)
        }
      }
      pollRef.current = setTimeout(poll, 2000)
    } catch (err: unknown) {
      setPlexAuthState('error')
      setPlexAuthError(err instanceof Error ? err.message : String(err))
    }
  }

  const clearPlexToken = () => {
    setCfg((p) => ({ ...p, plexToken: '', plexUrl: '' }))
    setPlexAuthState('idle')
    setPlexAuthError(null)
    setPlexServers([])
    if (pollRef.current) clearTimeout(pollRef.current)
  }

  const handleReset = () => {
    clearPlexToken()
    setCfg({ plexUrl: '', plexToken: '', radarrUrl: '', radarrApiKey: '', sonarrUrl: '', sonarrApiKey: '' })
    setTestResults({})
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'connections', data: cfg }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (service: string) => {
    setTesting((p) => ({ ...p, [service]: true }))
    setTestResults((p) => ({ ...p, [service]: undefined as unknown as TestResult }))
    try {
      const res = await fetch(`/api/settings/test/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      const data = await res.json()
      setTestResults((p) => ({ ...p, [service]: data }))
    } finally {
      setTesting((p) => ({ ...p, [service]: false }))
    }
  }

  const field = (key: keyof ConnectionState, label: string, type = 'text', placeholder = '') => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <Input
        type={type}
        placeholder={placeholder}
        value={cfg[key]}
        onChange={(e) => setCfg((p) => ({ ...p, [key]: e.target.value }))}
        autoComplete="off"
      />
    </div>
  )

  const TestStatus = ({ service }: { service: string }) => {
    const r = testResults[service]
    if (!r) return null
    return r.ok ? (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connected{r.version ? ` · v${r.version}` : ''}{r.name ? ` · ${r.name}` : ''}
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs text-rose-400">
        <XCircle className="h-3.5 w-3.5" />
        {r.error ?? 'Failed'}
      </span>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Connections</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your Plex, Radarr and Sonarr connections</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4" style={{ color: '#E5A00D' }} />
            Plex Media Server
          </CardTitle>
          <CardDescription>Sign in with Plex to discover and connect to your server automatically</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className={`text-sm font-medium ${plexAuthState !== 'success' ? 'text-muted-foreground/50' : ''}`}>
              Server URL
            </label>
            <Input
              type="url"
              placeholder="Sign in with Plex to auto-fill"
              value={cfg.plexUrl}
              disabled={plexAuthState !== 'success'}
              readOnly={plexAuthState === 'success' && plexServers.length <= 1}
              onChange={(e) => setCfg((p) => ({ ...p, plexUrl: e.target.value }))}
              className={plexAuthState !== 'success' ? 'opacity-40 cursor-not-allowed' : ''}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Authentication</label>
            {plexAuthState === 'success' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-sm text-emerald-400 flex-1">Signed in to Plex</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={clearPlexToken}>
                    <LogOut className="h-3 w-3 mr-1" />Sign out
                  </Button>
                </div>
                {plexServers.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Choose a different server</label>
                    <Select value={cfg.plexUrl} onValueChange={(v) => setCfg((p) => ({ ...p, plexUrl: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {plexServers.map((s) => (
                          <SelectItem key={s.url} value={s.url}>
                            {s.name} — {s.url}{s.local ? ' (local)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ) : plexAuthState === 'waiting' ? (
              <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-sm">Waiting for Plex sign-in...</p>
                  <p className="text-xs text-muted-foreground">Complete sign-in in the tab that just opened</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={clearPlexToken}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button variant="outline" onClick={startPlexAuth} className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Sign in with Plex
                </Button>
                {plexAuthState === 'error' && (
                  <p className="text-xs text-rose-400 flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" />{plexAuthError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Opens plex.tv to authorize Sweeparr — no password stored
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" variant="outline" onClick={() => handleTest('plex')} disabled={testing.plex || plexAuthState !== 'success'}>
              {testing.plex ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Test Connection
            </Button>
            <TestStatus service="plex" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-blue-400" />
            Radarr
          </CardTitle>
          <CardDescription>Movie management — used for deletion and poster images</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {field('radarrUrl', 'Radarr URL', 'url', 'http://radarr:7878')}
          {field('radarrApiKey', 'API Key', 'password', 'Your Radarr API key')}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => handleTest('radarr')} disabled={testing.radarr}>
              {testing.radarr ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Test Connection
            </Button>
            <TestStatus service="radarr" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-teal-400" />
            Sonarr
          </CardTitle>
          <CardDescription>TV show management — used for deletion and poster images</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {field('sonarrUrl', 'Sonarr URL', 'url', 'http://sonarr:8989')}
          {field('sonarrApiKey', 'API Key', 'password', 'Your Sonarr API key')}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => handleTest('sonarr')} disabled={testing.sonarr}>
              {testing.sonarr ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Test Connection
            </Button>
            <TestStatus service="sonarr" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
