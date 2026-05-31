import { NextResponse } from 'next/server'
import { getRunningJobs, nextCronDate } from '@/lib/scheduler/job-status'
import { getRecentLogs, clearLogs } from '@/lib/logger'
import prisma from '@/lib/db/client'
import { getSetting } from '@/lib/db/queries'
import { isDemoMode, demoPrisma } from '@/lib/demo'

export const dynamic = 'force-dynamic'

// GET /api/jobs/status — running jobs, schedule info, next run times
// Schedule state is read from the DB (source of truth) because Turbopack runs
// routes in isolated worker contexts — globalThis is not shared between workers.
export async function GET() {
  const demo = await isDemoMode()
  const running = demo ? [] : getRunningJobs()

  const [config, backupEnabled, backupCron] = await Promise.all([
    demo ? demoPrisma.scheduleConfig.findFirst() : prisma.scheduleConfig.findFirst(),
    demo ? Promise.resolve(null) : getSetting('backupEnabled'),
    demo ? Promise.resolve(null) : getSetting('backupCron'),
  ])

  type ScheduleEntry = { id: string; label: string; cronExpr: string; enabled: boolean; nextRunAt: string | null }
  const schedules: ScheduleEntry[] = []

  if (config) {
    const lsEnabled = config.libraryScanEnabled && !!config.libraryScanCron
    schedules.push({
      id: 'library-scan',
      label: 'Library Scan',
      cronExpr: config.libraryScanCron ?? '0 * * * *',
      enabled: lsEnabled,
      nextRunAt: lsEnabled ? nextCronDate(config.libraryScanCron)?.toISOString() ?? null : null,
    })

    const cleanupEnabled = config.enabled && !!config.cronExpr
    schedules.push({
      id: 'cleanup',
      label: 'Cleanup',
      cronExpr: config.cronExpr ?? '0 2 * * *',
      enabled: cleanupEnabled,
      nextRunAt: cleanupEnabled ? nextCronDate(config.cronExpr)?.toISOString() ?? null : null,
    })
  } else {
    schedules.push({ id: 'library-scan', label: 'Library Scan', cronExpr: '0 * * * *', enabled: false, nextRunAt: null })
    schedules.push({ id: 'cleanup', label: 'Cleanup', cronExpr: '0 2 * * *', enabled: false, nextRunAt: null })
  }

  const bkEnabled = backupEnabled === 'true'
  const bkCron = backupCron || '0 4 * * *'
  schedules.push({
    id: 'db-backup',
    label: 'Database Backup',
    cronExpr: bkCron,
    enabled: bkEnabled,
    nextRunAt: bkEnabled ? nextCronDate(bkCron)?.toISOString() ?? null : null,
  })

  return NextResponse.json({ running, schedules })
}

// DELETE /api/jobs/status — clear the in-memory log buffer
export async function DELETE() {
  if (await isDemoMode()) return NextResponse.json({ ok: true, cleared: 0 })
  const count = getRecentLogs().length
  clearLogs()
  return NextResponse.json({ ok: true, cleared: count })
}
