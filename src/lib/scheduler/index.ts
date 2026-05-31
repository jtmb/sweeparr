import cron, { ScheduledTask } from 'node-cron'
import prisma from '@/lib/db/client'
import { getSetting, setSetting } from '@/lib/db/queries'
import { generateReport, scanAllLibraries } from '@/lib/cleanup/engine'
import { executeReport } from '@/lib/cleanup/executor'
import { createDatabaseBackup, pruneOldBackups } from '@/lib/backup'
import { sendNotifications } from '@/lib/notifications'
import { backfillPosters } from '@/lib/scheduler/poster-backfill'
import { appLog } from '@/lib/logger'
import {
  markJobStarted,
  markJobFinished,
  registerSchedule,
  clearSchedules,
} from '@/lib/scheduler/job-status'

let cleanupTask: ScheduledTask | null = null
let libraryScanTask: ScheduledTask | null = null
let backupTask: ScheduledTask | null = null

export async function initScheduler() {
  // Stop any existing tasks
  cleanupTask?.stop()
  cleanupTask = null
  libraryScanTask?.stop()
  libraryScanTask = null
  backupTask?.stop()
  backupTask = null
  clearSchedules()

  const config = await prisma.scheduleConfig.findFirst()
  if (!config) return

  // ── Cleanup schedule ──────────────────────────────────────────────────────
  if (config.enabled && cron.validate(config.cronExpr)) {
    appLog('info', 'scheduler', `Cleanup schedule registered: ${config.cronExpr}`)
    registerSchedule({ id: 'cleanup', label: 'Cleanup', cronExpr: config.cronExpr, enabled: true })
    cleanupTask = cron.schedule(config.cronExpr, async () => {
      appLog('info', 'cleanup', 'Scheduled cleanup starting…')
      markJobStarted('cleanup', 'Cleanup')
      try {
        await scanAllLibraries()
        const reportId = await generateReport('scheduled')
        await prisma.scheduleConfig.updateMany({ data: { lastRunAt: new Date(), lastRunStatus: 'ok' } })
        if (config.autoDelete) {
          appLog('info', 'cleanup', `Auto-delete enabled — executing report ${reportId}`)
          await executeReport(reportId)
        }
        appLog('info', 'cleanup', 'Scheduled cleanup completed')
      } catch (err) {
        appLog('error', 'cleanup', `Scheduled cleanup error: ${String(err)}`)
        await prisma.scheduleConfig.updateMany({ data: { lastRunAt: new Date(), lastRunStatus: 'error' } })
      } finally {
        markJobFinished('cleanup')
      }
    })
  } else if (config.enabled) {
    appLog('warn', 'scheduler', `Invalid cleanup cron expression: ${config.cronExpr}`)
    registerSchedule({ id: 'cleanup', label: 'Cleanup', cronExpr: config.cronExpr, enabled: false })
  } else {
    registerSchedule({ id: 'cleanup', label: 'Cleanup', cronExpr: config.cronExpr, enabled: false })
  }

  // ── Library scan schedule ─────────────────────────────────────────────────
  if (config.libraryScanEnabled && cron.validate(config.libraryScanCron)) {
    appLog('info', 'scheduler', `Library scan schedule registered: ${config.libraryScanCron}`)
    registerSchedule({ id: 'library-scan', label: 'Library Scan', cronExpr: config.libraryScanCron, enabled: true })
    libraryScanTask = cron.schedule(config.libraryScanCron, async () => {
      appLog('info', 'library-scan', 'Scheduled library scan starting…')
      markJobStarted('library-scan', 'Library Scan')
      try {
        await scanAllLibraries()
        await prisma.scheduleConfig.updateMany({ data: { libraryScanLastAt: new Date() } })
        await sendNotifications({ type: 'scan_complete' }).catch(console.error)
        appLog('info', 'library-scan', 'Scheduled library scan completed')
        // Second-pass: fill in any posters that were missing after the scan
        await backfillPosters().catch((e) => appLog('error', 'poster-backfill', String(e)))
      } catch (err) {
        appLog('error', 'library-scan', `Scheduled library scan error: ${String(err)}`)
        await sendNotifications({ type: 'error', message: String(err) }).catch(console.error)
      } finally {
        markJobFinished('library-scan')
      }
    })
  } else if (config.libraryScanEnabled) {
    appLog('warn', 'scheduler', `Invalid library scan cron expression: ${config.libraryScanCron}`)
    registerSchedule({ id: 'library-scan', label: 'Library Scan', cronExpr: config.libraryScanCron, enabled: false })
  } else {
    registerSchedule({ id: 'library-scan', label: 'Library Scan', cronExpr: config.libraryScanCron ?? '0 * * * *', enabled: false })
  }

  // ── Database backup schedule (settings-backed) ─────────────────────────
  const backupEnabled = (await getSetting('backupEnabled')) === 'true'
  const backupCron = (await getSetting('backupCron')) || '0 4 * * *'
  const backupRetention = Math.max(1, parseInt((await getSetting('backupRetention')) || '7', 10) || 7)

  if (backupEnabled && cron.validate(backupCron)) {
    appLog('info', 'scheduler', `Backup schedule registered: ${backupCron}`)
    registerSchedule({ id: 'db-backup', label: 'Database Backup', cronExpr: backupCron, enabled: true })
    backupTask = cron.schedule(backupCron, async () => {
      appLog('info', 'backup', 'Scheduled database backup starting…')
      markJobStarted('db-backup', 'Database Backup')
      try {
        const created = await createDatabaseBackup('scheduled')
        const pruned = await pruneOldBackups(backupRetention)
        await setSetting('backupLastRunAt', new Date().toISOString())
        await setSetting('backupLastStatus', 'ok')
        appLog('info', 'backup', `Backup created: ${created.name} (${created.sizeBytes} bytes), pruned ${pruned}`)
      } catch (err) {
        await setSetting('backupLastRunAt', new Date().toISOString())
        await setSetting('backupLastStatus', 'error')
        appLog('error', 'backup', `Scheduled backup failed: ${String(err)}`)
      } finally {
        markJobFinished('db-backup')
      }
    })
  } else if (backupEnabled) {
    appLog('warn', 'scheduler', `Invalid backup cron expression: ${backupCron}`)
    registerSchedule({ id: 'db-backup', label: 'Database Backup', cronExpr: backupCron, enabled: false })
  } else {
    registerSchedule({ id: 'db-backup', label: 'Database Backup', cronExpr: backupCron, enabled: false })
  }
}

export async function reloadScheduler() {
  await initScheduler()
}
