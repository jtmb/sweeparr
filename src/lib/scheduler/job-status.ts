/**
 * Tracks which background jobs are currently running and exposes
 * the cron schedules so the UI can compute next run times.
 */

export interface RunningJob {
  id: string
  label: string
  startedAt: string // ISO string
}

export interface ScheduleEntry {
  id: string
  label: string
  cronExpr: string
  enabled: boolean
}

// ── Singleton state on globalThis — same pattern as logger.ts so the scheduler
// and the API route share the same Maps across module hot-reloads / route
// boundary isolation in Next.js.
declare const globalThis: typeof global & {
  _jobStatus?: {
    runningJobs: Map<string, RunningJob>
    schedules: Map<string, ScheduleEntry>
  }
}

if (!globalThis._jobStatus) {
  globalThis._jobStatus = {
    runningJobs: new Map(),
    schedules: new Map(),
  }
}

const _state = globalThis._jobStatus

// ─── Running jobs ─────────────────────────────────────────────────────────────

export function markJobStarted(id: string, label: string): void {
  _state.runningJobs.set(id, { id, label, startedAt: new Date().toISOString() })
}

export function markJobFinished(id: string): void {
  _state.runningJobs.delete(id)
}

export function getRunningJobs(): RunningJob[] {
  return [..._state.runningJobs.values()]
}

// ─── Schedule registry ────────────────────────────────────────────────────────

export function registerSchedule(entry: ScheduleEntry): void {
  _state.schedules.set(entry.id, entry)
}

export function clearSchedules(): void {
  _state.schedules.clear()
}

export function getSchedules(): ScheduleEntry[] {
  return [..._state.schedules.values()]
}

// ─── Next-run calculator ──────────────────────────────────────────────────────

/** Compute the next Date that a 5-field cron expression fires after `from`. */
export function nextCronDate(expr: string, from: Date = new Date()): Date | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minuteField, hourField, domField, monthField, dowField] = parts

  function matchField(value: number, field: string): boolean {
    if (field === '*') return true
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10)
      if (isNaN(step) || step <= 0) return false
      return value % step === 0
    }
    for (const part of field.split(',')) {
      if (part.includes('-')) {
        const [lo, hi] = part.split('-').map(Number)
        if (!isNaN(lo) && !isNaN(hi) && value >= lo && value <= hi) return true
      } else {
        if (parseInt(part, 10) === value) return true
      }
    }
    return false
  }

  // Start checking from the next minute
  const candidate = new Date(from)
  candidate.setSeconds(0)
  candidate.setMilliseconds(0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  // Check up to 8 days (11520 minutes) — covers all weekly/monthly patterns
  const LIMIT = 11520
  for (let i = 0; i < LIMIT; i++) {
    const month = candidate.getMonth() + 1
    const dom   = candidate.getDate()
    const dow   = candidate.getDay()
    const hour  = candidate.getHours()
    const min   = candidate.getMinutes()

    if (
      matchField(month, monthField) &&
      matchField(dom, domField) &&
      matchField(dow, dowField) &&
      matchField(hour, hourField) &&
      matchField(min, minuteField)
    ) {
      return new Date(candidate)
    }
    candidate.setMinutes(candidate.getMinutes() + 1)
  }
  return null
}
