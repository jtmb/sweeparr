'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  RefreshCw,
  CheckCircle2,
  Clock,
  PlayCircle,
  RotateCcw,
  Library,
  AlertTriangle,
  Wand2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface ScheduleConfig {
  cronExpr: string
  enabled: boolean
  autoDelete: boolean
  lastRunAt?: string | null
  lastRunStatus?: string | null
  libraryScanEnabled: boolean
  libraryScanCron: string
  libraryScanLastAt?: string | null
}

const CLEANUP_PRESETS = [
  { label: 'Daily at 2am', value: '0 2 * * *' },
  { label: 'Weekly Sun 3am', value: '0 3 * * 0' },
  { label: 'Monthly 1st 4am', value: '0 4 1 * *' },
]

const SCAN_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
]

type HelperType = 'hours' | 'daily' | 'weekly'

type CronHelperState = {
  type: HelperType
  everyNHours: number
  minute: number
  hour: number
  dayOfWeek: number
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function buildCron(h: CronHelperState): string {
  if (h.type === 'hours') return `${h.minute} */${h.everyNHours} * * *`
  if (h.type === 'weekly') return `${h.minute} ${h.hour} * * ${h.dayOfWeek}`
  return `${h.minute} ${h.hour} * * *`
}

function describeCron(h: CronHelperState): string {
  const hh = String(h.hour).padStart(2, '0')
  const mm = String(h.minute).padStart(2, '0')
  if (h.type === 'hours') return `Every ${h.everyNHours} hour(s) at :${mm}`
  if (h.type === 'weekly') return `Every ${DAY_NAMES[h.dayOfWeek]} at ${hh}:${mm}`
  return `Every day at ${hh}:${mm}`
}

function parseCronField(field: string, max: number): Set<number> {
  const result = new Set<number>()
  if (field === '*') {
    for (let i = 0; i < max; i++) result.add(i)
    return result
  }
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10) || 1
    for (let i = 0; i < max; i += step) result.add(i)
    return result
  }
  for (const part of field.split(',')) {
    const num = parseInt(part, 10)
    if (!isNaN(num)) result.add(num)
  }
  return result
}

function cronConflicts(cron1: string, cron2: string): boolean {
  try {
    const parts1 = cron1.trim().split(/\s+/)
    const parts2 = cron2.trim().split(/\s+/)
    if (parts1.length < 5 || parts2.length < 5) return false
    const minutes1 = parseCronField(parts1[0], 60)
    const minutes2 = parseCronField(parts2[0], 60)
    const hours1 = parseCronField(parts1[1], 24)
    const hours2 = parseCronField(parts2[1], 24)
    return [...minutes1].some((m) => minutes2.has(m)) && [...hours1].some((h) => hours2.has(h))
  } catch {
    return false
  }
}

function shiftCronHourBy1(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length < 5) return cronExpr
  const hour = parseInt(parts[1], 10)
  if (!isNaN(hour)) {
    parts[1] = String((hour + 1) % 24)
    return parts.join(' ')
  }
  return cronExpr
}

function InlineCronHelper({
  value,
  onApply,
  defaultCron,
}: {
  value: string
  onApply: (cron: string) => void
  defaultCron: string
}) {
  const [helper, setHelper] = useState<CronHelperState>({
    type: 'daily',
    everyNHours: 6,
    minute: 0,
    hour: 2,
    dayOfWeek: 0,
  })

  const generatedCron = useMemo(() => buildCron(helper), [helper])
  const generatedCronDesc = useMemo(() => describeCron(helper), [helper])

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Cron Helper</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Frequency</label>
          <Select
            value={helper.type}
            onValueChange={(v) => setHelper((p) => ({ ...p, type: v as HelperType }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">Every N hours</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {helper.type === 'hours' ? (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Every</label>
            <Select
              value={String(helper.everyNHours)}
              onValueChange={(v) => setHelper((p) => ({ ...p, everyNHours: parseInt(v, 10) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} hour(s)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Hour</label>
            <Select
              value={String(helper.hour)}
              onValueChange={(v) => setHelper((p) => ({ ...p, hour: parseInt(v, 10) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Minute</label>
          <Select
            value={String(helper.minute)}
            onValueChange={(v) => setHelper((p) => ({ ...p, minute: parseInt(v, 10) }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                <SelectItem key={m} value={String(m)}>:{String(m).padStart(2, '0')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {helper.type === 'weekly' && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Day</label>
            <Select
              value={String(helper.dayOfWeek)}
              onValueChange={(v) => setHelper((p) => ({ ...p, dayOfWeek: parseInt(v, 10) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        <p>{generatedCronDesc}</p>
        <p className="font-mono mt-1">{generatedCron}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onApply(generatedCron)}>
          Apply Generated Cron
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onApply(defaultCron)}>
          Reset to Default
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onApply(value)}>
          Keep Current
        </Button>
      </div>
    </div>
  )
}

export default function SchedulePage() {
  const [config, setConfig] = useState<ScheduleConfig>({
    cronExpr: '0 2 * * *',
    enabled: false,
    autoDelete: false,
    libraryScanEnabled: false,
    libraryScanCron: '0 * * * *',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [runningNow, setRunningNow] = useState(false)
  const [runResult, setRunResult] = useState<string | null>(null)
  const [conflictBanner, setConflictBanner] = useState<string | null>(null)
  const [scanHelperOpen, setScanHelperOpen] = useState(false)
  const [cleanupHelperOpen, setCleanupHelperOpen] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.schedule) setConfig((prev) => ({ ...prev, ...d.schedule }))
      })
      .catch(() => {})
  }, [])

  const applyScanCron = (scanCron: string) => {
    let nextCleanup = config.cronExpr
    let banner: string | null = null

    if (cronConflicts(scanCron, nextCleanup)) {
      const shifted = shiftCronHourBy1(nextCleanup)
      if (shifted !== nextCleanup) {
        nextCleanup = shifted
        const hour = parseInt(nextCleanup.split(/\s+/)[1], 10)
        banner = `Cleanup was automatically moved to ${String(hour).padStart(2, '0')}:00 to avoid overlapping with library scan.`
      } else {
        banner = 'Schedules may overlap. Please review cron expressions manually.'
      }
    }

    setConfig((prev) => ({ ...prev, libraryScanCron: scanCron, cronExpr: nextCleanup }))
    setConflictBanner(banner)
    if (banner) setTimeout(() => setConflictBanner(null), 10000)
  }

  const applyCleanupCron = (cleanupCron: string) => {
    setConfig((prev) => ({ ...prev, cronExpr: cleanupCron }))
    if (cronConflicts(config.libraryScanCron, cleanupCron)) {
      setConflictBanner('Cleanup and Library Scan are set to overlapping times. Cleanup will be shifted at runtime if possible.')
      setTimeout(() => setConflictBanner(null), 10000)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'schedule', data: config }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleReset = async () => {
    setConflictBanner(null)
    const defaults: ScheduleConfig = {
      cronExpr: '0 2 * * *', enabled: false, autoDelete: false,
      libraryScanEnabled: false, libraryScanCron: '0 * * * *',
    }
    setConfig(defaults)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'schedule', data: defaults }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleRunNow = async () => {
    setRunningNow(true)
    setRunResult(null)
    try {
      const res = await fetch('/api/reports', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRunResult(`Report generated: ${data.reportId}`)
    } catch (e: unknown) {
      setRunResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunningNow(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Schedule</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure when library scans and cleanup reports run automatically
        </p>
      </div>

      {conflictBanner && (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{conflictBanner}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Library className="h-4 w-4 text-primary" />
            Library Scan Schedule
          </CardTitle>
          <CardDescription>
            Periodically refresh library caches so media data stays current
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Library Scan Schedule</p>
              <p className="text-xs text-muted-foreground">Automatically rescan all libraries on a schedule</p>
            </div>
            <Switch
              checked={config.libraryScanEnabled}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, libraryScanEnabled: v }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Scan Cron Expression</label>
            <Input
              value={config.libraryScanCron}
              onChange={(e) => setConfig((p) => ({ ...p, libraryScanCron: e.target.value }))}
              placeholder="0 * * * *"
              className="font-mono"
              disabled={!config.libraryScanEnabled}
            />
            <div className="flex flex-wrap gap-2">
              {SCAN_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setConfig((prev) => ({ ...prev, libraryScanCron: p.value }))}
                  disabled={!config.libraryScanEnabled}
                  className="text-xs px-2 py-1 rounded bg-secondary hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setScanHelperOpen((v) => !v)}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Cron Helper
              {scanHelperOpen ? (
                <ChevronUp className="h-3.5 w-3.5 ml-1.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
              )}
            </Button>
            {scanHelperOpen && (
              <InlineCronHelper
                value={config.libraryScanCron}
                onApply={applyScanCron}
                defaultCron="0 * * * *"
              />
            )}
          </div>

          {config.libraryScanLastAt && (
            <p className="text-xs text-muted-foreground">
              Last scan: {formatDate(config.libraryScanLastAt)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            Cleanup Schedule
          </CardTitle>
          <CardDescription>
            Run cleanup analysis (and optionally auto-delete) on a schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Cleanup Schedule</p>
              <p className="text-xs text-muted-foreground">Automatically generate cleanup reports</p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, enabled: v }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Cron Expression</label>
            <Input
              value={config.cronExpr}
              onChange={(e) => setConfig((p) => ({ ...p, cronExpr: e.target.value }))}
              placeholder="0 2 * * *"
              className="font-mono"
              disabled={!config.enabled}
            />
            <div className="flex flex-wrap gap-2">
              {CLEANUP_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setConfig((prev) => ({ ...prev, cronExpr: p.value }))}
                  disabled={!config.enabled}
                  className="text-xs px-2 py-1 rounded bg-secondary hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setCleanupHelperOpen((v) => !v)}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Cron Helper
              {cleanupHelperOpen ? (
                <ChevronUp className="h-3.5 w-3.5 ml-1.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
              )}
            </Button>
            {cleanupHelperOpen && (
              <InlineCronHelper
                value={config.cronExpr}
                onApply={applyCleanupCron}
                defaultCron="0 2 * * *"
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-destructive">Auto-Delete</p>
              <p className="text-xs text-muted-foreground">
                Automatically execute deletions after each scheduled run (dangerous!)
              </p>
            </div>
            <Switch
              checked={config.autoDelete}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, autoDelete: v }))}
            />
          </div>

          {config.lastRunAt && (
            <div className="text-xs text-muted-foreground pt-1">
              Last run: {formatDate(config.lastRunAt)} ·{' '}
              <span className={config.lastRunStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>
                {config.lastRunStatus ?? 'unknown'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Schedule
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        <Button variant="outline" onClick={handleRunNow} disabled={runningNow}>
          {runningNow ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
          Run Cleanup Now
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
        {runResult && (
          <span className={`text-sm ${runResult.startsWith('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>
            {runResult}
          </span>
        )}
      </div>
    </div>
  )
}
