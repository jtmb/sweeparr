'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, CheckCircle2, MessageSquare, Mail, Bell, RotateCcw, Send, X } from 'lucide-react'

export default function NotificationsPage() {
  const [discord, setDiscord] = useState({
    enabled: false,
    webhookUrl: '',
    onCleanupComplete: true,
    onReportReady: true,
    onScanComplete: true,
    onError: true,
    attachHtmlReport: false,
  })
  const [smtp, setSmtp] = useState({ enabled: false, host: '', port: 587, secure: false, user: '', pass: '', from: '', to: [] as string[], onCleanupComplete: true, onReportReady: true, attachHtmlReport: false })
  const [smtpToInput, setSmtpToInput] = useState('')
  const [apprise, setApprise] = useState({ enabled: false, url: '' })
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok?: boolean; error?: string }>>({} as Record<string, { ok?: boolean; error?: string }>)

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (d.notifications?.discord) setDiscord(d.notifications.discord as typeof discord)
      if (d.notifications?.smtp) {
        const raw = d.notifications.smtp as Record<string, unknown>
        const toVal = raw.to
        setSmtp((p) => ({
          ...p,
          ...(raw as typeof p),
          to: Array.isArray(toVal) ? (toVal as string[]) : toVal ? [toVal as string] : [],
        }))
      }
      if (d.notifications?.apprise) setApprise(d.notifications.apprise as typeof apprise)
    }).catch(() => {})
  }, [])

  const save = async (type: string, data: Record<string, unknown>) => {
    setSaving(type)
    setSaved(null)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'notifications', data: { type, ...data } }),
    })
    setSaving(null)
    setSaved(type)
    setTimeout(() => setSaved(null), 3000)
  }

  const DEFAULTS = {
    discord: { enabled: false, webhookUrl: '', onCleanupComplete: true, onReportReady: true, onScanComplete: true, onError: true, attachHtmlReport: false },
    smtp: { enabled: false, host: '', port: 587, secure: false, user: '', pass: '', from: '', to: [] as string[], onCleanupComplete: true, onReportReady: true, attachHtmlReport: false },
    apprise: { enabled: false, url: '' },
  }

  const sendTest = async (channel: 'discord' | 'smtp' | 'apprise') => {
    setTesting(channel)
    setTestResult((p) => ({ ...p, [channel]: {} }))
    const cfg = channel === 'discord' ? discord : channel === 'smtp' ? smtp : apprise
    try {
      const res = await fetch(`/api/settings/test/${channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, withHtml: false }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      setTestResult((p) => ({ ...p, [channel]: data }))
    } catch (e) {
      setTestResult((p) => ({ ...p, [channel]: { ok: false, error: String(e) } }))
    } finally {
      setTesting(null)
    }
  }

  const resetChannel = async (type: 'discord' | 'smtp' | 'apprise') => {
    const def = DEFAULTS[type]
    if (type === 'discord') setDiscord(def as typeof discord)
    if (type === 'smtp') setSmtp(def as typeof smtp)
    if (type === 'apprise') setApprise(def as typeof apprise)
    await save(type, def)
  }

  const SaveBtn = ({ type, data }: { type: string; data: Record<string, unknown> }) => {
    const ch = type as 'discord' | 'smtp' | 'apprise'
    const canTest =
      ch === 'discord' ? !!(data.webhookUrl as string)
      : ch === 'smtp' ? !!(data.host as string) && (data.to as string[]).length > 0
      : !!(data.url as string)
    return (
      <div className="flex items-center gap-3 mt-5">
        <Button onClick={() => save(type, data)} disabled={saving === type}>
          {saving === type ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save
        </Button>
        <Button variant="outline" onClick={() => resetChannel(ch)}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canTest || testing === ch} onClick={() => sendTest(ch)}>
          {testing === ch ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
          Send Test
        </Button>
        {saved === type && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />Saved
          </span>
        )}
        {testResult[ch]?.ok === true && <span className="text-xs text-emerald-400">&#10003; Test sent</span>}
        {testResult[ch]?.ok === false && <span className="text-xs text-red-400">&#10007; {testResult[ch].error ?? 'Failed'}</span>}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Get notified when cleanup reports are generated or executed
        </p>
      </div>

      <Tabs defaultValue="discord">
        <TabsList>
          <TabsTrigger value="discord"><MessageSquare className="h-3.5 w-3.5 mr-1.5" />Discord</TabsTrigger>
          <TabsTrigger value="smtp"><Mail className="h-3.5 w-3.5 mr-1.5" />Email</TabsTrigger>
          <TabsTrigger value="apprise"><Bell className="h-3.5 w-3.5 mr-1.5" />Apprise</TabsTrigger>
        </TabsList>

        <TabsContent value="discord">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-[#5865F2]" />
                Discord Webhook
              </CardTitle>
              <CardDescription>Send cleanup reports to a Discord channel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Enabled</p>
                <Switch checked={discord.enabled} onCheckedChange={(v) => setDiscord((p) => ({ ...p, enabled: v }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Webhook URL</label>
                <Input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={discord.webhookUrl}
                  onChange={(e) => setDiscord((p) => ({ ...p, webhookUrl: e.target.value }))}
                />
              </div>
              <div className="space-y-3 pt-1">
                <p className="text-sm font-medium text-muted-foreground">Notify on</p>
                {(
                  [
                    { key: 'onCleanupComplete', label: 'Cleanup completed' },
                    { key: 'onReportReady', label: 'Report ready' },
                    { key: 'onScanComplete', label: 'Library scan completed' },
                    { key: 'onError', label: 'Errors' },
                  ] as { key: keyof typeof discord; label: string }[]
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <p className="text-sm">{label}</p>
                    <Switch
                      checked={discord[key] as boolean}
                      onCheckedChange={(v) => setDiscord((p) => ({ ...p, [key]: v }))}
                    />
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-border space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Attachments</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Attach HTML report</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Upload the full interactive HTML report as a file to Discord</p>
                  </div>
                  <Switch checked={discord.attachHtmlReport} onCheckedChange={(v) => setDiscord((p) => ({ ...p, attachHtmlReport: v }))} />
                </div>
              </div>
              <SaveBtn type="discord" data={discord} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smtp">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-primary" />
                SMTP Email
              </CardTitle>
              <CardDescription>Send email reports via your SMTP server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Enabled</p>
                <Switch checked={smtp.enabled} onCheckedChange={(v) => setSmtp((p) => ({ ...p, enabled: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">SMTP Host</label>
                  <Input placeholder="smtp.example.com" value={smtp.host} onChange={(e) => setSmtp((p) => ({ ...p, host: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Port</label>
                  <Input type="number" value={smtp.port} onChange={(e) => setSmtp((p) => ({ ...p, port: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300 space-y-1">
                <p className="font-semibold">Gmail quick setup</p>
                <p>Host: <code>smtp.gmail.com</code>&nbsp;&nbsp;Port: <code>587</code>&nbsp;&nbsp;Secure: off</p>
                <p>Use an <strong>App Password</strong> (not your Google account password).{' '}
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">Create one here &rarr;</a>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 text-xs h-7"
                  onClick={() => setSmtp((p) => ({ ...p, host: 'smtp.gmail.com', port: 587, secure: false }))}
                >
                  Apply Gmail defaults
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Username</label>
                  <Input autoComplete="off" value={smtp.user} onChange={(e) => setSmtp((p) => ({ ...p, user: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Password</label>
                  <Input type="password" autoComplete="new-password" value={smtp.pass} onChange={(e) => setSmtp((p) => ({ ...p, pass: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">From</label>
                <Input type="email" placeholder="donkey@yourdomain.com" value={smtp.from} onChange={(e) => setSmtp((p) => ({ ...p, from: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">To</label>
                <div className="flex flex-wrap gap-1.5 min-h-[38px] rounded-md border border-input bg-background px-2 py-1.5">
                  {smtp.to.map((email, idx) => (
                    <span key={idx} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
                      {email}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground leading-none"
                        onClick={() => setSmtp((p) => ({ ...p, to: p.to.filter((_, i) => i !== idx) }))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {smtp.to.length === 0 && <span className="text-xs text-muted-foreground self-center">No recipients added</span>}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="user@example.com — press Enter or comma to add"
                    value={smtpToInput}
                    onChange={(e) => setSmtpToInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        const v = smtpToInput.trim().replace(/,$/, '')
                        if (v && !smtp.to.includes(v)) setSmtp((p) => ({ ...p, to: [...p.to, v] }))
                        setSmtpToInput('')
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const v = smtpToInput.trim()
                      if (v && !smtp.to.includes(v)) setSmtp((p) => ({ ...p, to: [...p.to, v] }))
                      setSmtpToInput('')
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Use TLS/SSL</p>
                <Switch checked={smtp.secure} onCheckedChange={(v) => setSmtp((p) => ({ ...p, secure: v }))} />
              </div>
              <div className="pt-2 border-t border-border space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Notify on</p>
                {(
                  [
                    { key: 'onCleanupComplete' as const, label: 'Cleanup completed' },
                    { key: 'onReportReady' as const, label: 'Report ready' },
                  ]
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <p className="text-sm">{label}</p>
                    <Switch
                      checked={(smtp as Record<string, unknown>)[key] as boolean ?? true}
                      onCheckedChange={(v) => setSmtp((p) => ({ ...p, [key]: v }))}
                    />
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-border space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Attachments</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Attach HTML report</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Attach the full interactive HTML report as a file to each email</p>
                  </div>
                  <Switch checked={smtp.attachHtmlReport} onCheckedChange={(v) => setSmtp((p) => ({ ...p, attachHtmlReport: v }))} />
                </div>
              </div>
              <SaveBtn type="smtp" data={smtp} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="apprise">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-amber-400" />
                Apprise / Notifiarr
              </CardTitle>
              <CardDescription>
                Use Apprise to notify via 50+ services (Slack, Telegram, Pushover, Notifiarr, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Enabled</p>
                <Switch checked={apprise.enabled} onCheckedChange={(v) => setApprise((p) => ({ ...p, enabled: v }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Apprise URL</label>
                <Input
                  type="url"
                  placeholder="http://apprise:8000/notify"
                  value={apprise.url}
                  onChange={(e) => setApprise((p) => ({ ...p, url: e.target.value }))}
                />
              </div>
              <SaveBtn type="apprise" data={apprise} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
