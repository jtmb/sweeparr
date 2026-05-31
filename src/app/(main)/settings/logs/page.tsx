'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Activity,
  Clock,
  Library,
  Trash2,
  Image as ImageIcon,
  RefreshCw,
  Eraser,
  Circle,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
} from 'lucide-react'
import type { LogEntry, LogTag } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunningJob {
  id: string
  label: string
  startedAt: string
}

interface ScheduleInfo {
  id: string
  label: string
  cronExpr: string
  enabled: boolean
  nextRunAt: string | null
}

type FilterTag = LogTag | 'all'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAG_ICONS: Record<string, React.ReactNode> = {
  scheduler: <Activity className="h-3 w-3" />,
  'library-scan': <Library className="h-3 w-3" />,
  cleanup: <Trash2 className="h-3 w-3" />,
  'poster-backfill': <ImageIcon className="h-3 w-3" />,
  system: <Circle className="h-3 w-3" />,
}

const TAG_COLOURS: Record<string, string> = {
  scheduler: 'text-sky-400 bg-sky-400/10',
  'library-scan': 'text-violet-400 bg-violet-400/10',
  cleanup: 'text-rose-400 bg-rose-400/10',
  'poster-backfill': 'text-amber-400 bg-amber-400/10',
  system: 'text-slate-400 bg-slate-400/10',
}

const LEVEL_COLOURS: Record<string, string> = {
  info: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
  debug: 'text-slate-400',
}

const LEVEL_BADGE: Record<string, string> = {
  info: 'bg-emerald-400/10 text-emerald-400',
  warn: 'bg-amber-400/10 text-amber-400',
  error: 'bg-rose-400/10 text-rose-400',
  debug: 'bg-slate-400/10 text-slate-400',
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

function fmtRelative(iso: string): string {
  try {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
    if (secs < 60) return `${secs}s ago`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    return `${Math.floor(secs / 3600)}h ago`
  } catch {
    return ''
  }
}

function fmtNextRun(iso: string | null): string {
  if (!iso) return '—'
  try {
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return 'soon'
    const min = Math.floor(ms / 60000)
    if (min < 60) return `in ${min}m`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`
  } catch {
    return '—'
  }
}

const FILTER_TAGS: { label: string; value: FilterTag }[] = [
  { label: 'All', value: 'all' },
  { label: 'Scheduler', value: 'scheduler' },
  { label: 'Library Scan', value: 'library-scan' },
  { label: 'Cleanup', value: 'cleanup' },
  { label: 'Poster Backfill', value: 'poster-backfill' },
]

// ─── Job status card ──────────────────────────────────────────────────────────

function JobStatusCard({
  schedules,
  running,
}: {
  schedules: ScheduleInfo[]
  running: RunningJob[]
}) {
  const isRunning = (id: string) => running.some((j) => j.id === id)
  const startedAt = (id: string) => running.find((j) => j.id === id)?.startedAt ?? null

  const JOB_DEFS = [
    { id: 'library-scan', label: 'Library Scan', icon: Library },
    { id: 'cleanup', label: 'Cleanup', icon: Trash2 },
    { id: 'poster-backfill', label: 'Poster Backfill', icon: ImageIcon },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {JOB_DEFS.map(({ id, label, icon: Icon }) => {
        const schedule = schedules.find((s) => s.id === id)
        const running_ = isRunning(id)
        const started = startedAt(id)

        return (
          <div
            key={id}
            className="rounded-lg border border-border bg-card px-4 py-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{label}</span>
              {running_ ? (
                <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Running
                </span>
              ) : schedule?.enabled ? (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  Scheduled
                </span>
              ) : id === 'poster-backfill' ? (
                <span className="ml-auto text-xs text-muted-foreground">On demand</span>
              ) : (
                <span className="ml-auto text-xs text-muted-foreground">Disabled</span>
              )}
            </div>

            <div className="text-xs text-muted-foreground space-y-0.5">
              {running_ && started ? (
                <p>Started {fmtRelative(started)}</p>
              ) : schedule?.enabled ? (
                <>
                  <p className="font-mono">{schedule.cronExpr}</p>
                  <p>Next run: {fmtNextRun(schedule.nextRunAt)}</p>
                </>
              ) : (
                <p className="italic">Not scheduled</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Console log line ─────────────────────────────────────────────────────────

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex items-start gap-2 py-0.5 hover:bg-white/[0.02] px-1 rounded min-w-0 font-mono text-xs leading-5">
      <span className="shrink-0 text-muted-foreground/60 w-[76px] text-right tabular-nums">
        {fmtTime(entry.timestamp)}
      </span>
      <span className={`shrink-0 uppercase font-semibold w-9 text-center tabular-nums ${LEVEL_COLOURS[entry.level] ?? ''}`}>
        {entry.level === 'info' ? 'INFO' : entry.level === 'warn' ? 'WARN' : entry.level === 'error' ? ' ERR' : ' DBG'}
      </span>
      <span className={`shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 text-[10px] font-medium ${TAG_COLOURS[entry.tag] ?? 'text-slate-400 bg-slate-400/10'}`}>
        {TAG_ICONS[entry.tag]}
        {entry.tag}
      </span>
      <span className={`flex-1 min-w-0 break-words ${entry.level === 'error' ? 'text-rose-300' : entry.level === 'warn' ? 'text-amber-300' : 'text-foreground/90'}`}>
        {entry.message}
      </span>
    </div>
  )
}

// ─── Logs page ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<FilterTag>('all')
  const [running, setRunning] = useState<RunningJob[]>([])
  const [schedules, setSchedules] = useState<ScheduleInfo[]>([])
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const [clearing, setClearing] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused

  // ── SSE connection ──────────────────────────────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      es = new EventSource('/api/logs/stream')

      es.onopen = () => setConnected(true)

      es.onmessage = (ev) => {
        try {
          const entry = JSON.parse(ev.data) as LogEntry
          setLogs((prev) => {
            const next = prev.length >= 500 ? prev.slice(-499) : prev
            return [...next, entry]
          })
        } catch { /* ignore */ }
      }

      es.onerror = () => {
        setConnected(false)
        es?.close()
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, paused])

  // Detect manual scroll to auto-pause
  const handleScroll = useCallback(() => {
    const el = consoleRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (!atBottom && !pausedRef.current) setPaused(true)
    if (atBottom && pausedRef.current) setPaused(false)
  }, [])

  // ── Job status poll ──────────────────────────────────────────────────────────
  const fetchStatus = useCallback(() => {
    fetch('/api/jobs/status')
      .then((r) => r.json())
      .then((d) => {
        setRunning(d.running ?? [])
        setSchedules(d.schedules ?? [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // ── Clear logs ───────────────────────────────────────────────────────────────
  const handleClear = async () => {
    setClearing(true)
    await fetch('/api/jobs/status', { method: 'DELETE' }).catch(() => {})
    setLogs([])
    setClearing(false)
  }

  const visible = filter === 'all' ? logs : logs.filter((l) => l.tag === filter)

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live job activity, scheduled task status, and real-time application logs
        </p>
      </div>

      {/* Job status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Job Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <JobStatusCard schedules={schedules} running={running} />
          {running.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {running.length} job{running.length !== 1 ? 's' : ''} currently running
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live console */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              Live Console
            </CardTitle>
            {/* Connection status */}
            <span className={`ml-auto flex items-center gap-1 text-xs ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {connected ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Reconnecting…
                </>
              )}
            </span>
          </div>

          {/* Filter + controls row */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <div className="flex items-center gap-1 flex-wrap">
              {FILTER_TAGS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setFilter(t.value)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    filter === t.value
                      ? 'bg-primary/20 text-primary font-medium'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {paused && (
                <button
                  onClick={() => {
                    setPaused(false)
                    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Scroll paused — click to resume
                </button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={handleClear}
                disabled={clearing}
              >
                {clearing ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Eraser className="h-3 w-3 mr-1" />
                )}
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 flex-1">
          <div
            ref={consoleRef}
            onScroll={handleScroll}
            className="h-[480px] overflow-y-auto bg-[hsl(220_12%_8%)] rounded-b-lg px-2 py-2 space-y-0"
          >
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 gap-2">
                <Activity className="h-6 w-6" />
                <span className="text-sm">
                  {connected ? 'Waiting for log entries…' : 'Connecting to log stream…'}
                </span>
              </div>
            ) : (
              visible.map((entry) => <LogLine key={entry.id} entry={entry} />)
            )}
            <div ref={bottomRef} />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Logs are stored in memory — they are lost when the server restarts. Up to 500 entries are retained.
      </p>
    </div>
  )
}
