import prisma from '@/lib/db/client'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import { createRadarrClient } from '@/lib/radarr/client'
import { createSonarrClient } from '@/lib/sonarr/client'
import { sendNotifications } from '@/lib/notifications'
import { appLog } from '@/lib/logger'
import axios from 'axios'

export async function executeReport(
  reportId: string,
  options?: { allowPlexDeletion?: boolean }
): Promise<{
  deleted: number
  failed: number
  skipped: number
}> {
  const report = await prisma.cleanupReport.findUnique({
    where: { id: reportId },
    include: { items: { where: { status: 'pending' } } },
  })

  if (!report) throw new Error('Report not found')
  if (!['READY', 'DRAFT'].includes(report.status)) {
    throw new Error(`Report is in ${report.status} state and cannot be executed`)
  }

  appLog('info', 'cleanup', `Executing report ${reportId} — ${report.items.length} item(s) pending`)

  await prisma.cleanupReport.update({
    where: { id: reportId },
    data: { status: 'EXECUTING', pauseRequested: false, stopRequested: false },
  })

  const cfg = await getConnectionConfig()
  const plex = cfg.plexUrl ? createPlexClient(cfg.plexUrl, cfg.plexToken) : null
  const radarr = cfg.radarrUrl ? createRadarrClient(cfg.radarrUrl, cfg.radarrApiKey) : null
  const sonarr = cfg.sonarrUrl ? createSonarrClient(cfg.sonarrUrl, cfg.sonarrApiKey) : null
  const allowPlexDeletion = options?.allowPlexDeletion === true

  // Helper: try Plex fallback deletion. Throws with a meaningful message on failure.
  const tryPlexFallback = async (plexRatingKey: string | null, title: string): Promise<void> => {
    if (!plex || !plexRatingKey) {
      throw new Error('Not found in arr and Plex deletion is not available')
    }
    await plex.deleteMetadata(plexRatingKey)
  }

  let deleted = 0
  let failed = 0
  let skipped = 0

  for (const item of report.items) {
    // Check for pause or stop request before processing each item
    const currentReport = await prisma.cleanupReport.findUnique({
      where: { id: reportId },
      select: { pauseRequested: true, stopRequested: true },
    })
    if (currentReport?.stopRequested) {
      await prisma.cleanupReport.update({
        where: { id: reportId },
        data: { status: 'COMPLETED', executedAt: new Date(), pauseRequested: false, stopRequested: false },
      })
      appLog('info', 'cleanup', `Report ${reportId} stopped — deleted ${deleted}, skipped ${skipped}, failed ${failed}`)
      return { deleted, failed, skipped }
    }
    if (currentReport?.pauseRequested) {
      await prisma.cleanupReport.update({
        where: { id: reportId },
        data: { status: 'PAUSED', pauseRequested: false },
      })
      appLog('info', 'cleanup', `Report ${reportId} paused — deleted ${deleted} so far`)
      return { deleted, failed, skipped }
    }

    try {
      let didDelete = false

      if (item.mediaType === 'movie' && item.radarrId && radarr) {
        try {
          await radarr.deleteMovie(item.radarrId, true)
          didDelete = true
        } catch (err: unknown) {
          const isNotFound =
            (axios.isAxiosError(err) && err.response?.status === 404) ||
            (err instanceof Error && (err as Error & { notFoundInArr?: boolean }).notFoundInArr === true)
          if (isNotFound) {
            await tryPlexFallback(item.plexRatingKey, item.title)
            didDelete = true
          } else {
            throw err
          }
        }
      } else if (item.mediaType === 'show' && item.sonarrId && sonarr) {
        try {
          await sonarr.deleteSeries(item.sonarrId, true)
          didDelete = true
        } catch (err: unknown) {
          const isNotFound =
            (axios.isAxiosError(err) && err.response?.status === 404) ||
            (err instanceof Error && (err as Error & { notFoundInArr?: boolean }).notFoundInArr === true)
          if (isNotFound) {
            await tryPlexFallback(item.plexRatingKey, item.title)
            didDelete = true
          } else {
            throw err
          }
        }
      } else if (item.plexRatingKey && plex) {
        // No arr ID at all — go straight to Plex if available
        await tryPlexFallback(item.plexRatingKey, item.title)
        didDelete = true
      }

      if (didDelete) {
        await prisma.cleanupReportItem.update({
          where: { id: item.id },
          data: { status: 'deleted' },
        })
        appLog('info', 'cleanup', `Deleted: "${item.title}"`)
        deleted++
      } else {
        await prisma.cleanupReportItem.update({
          where: { id: item.id },
          data: { status: 'skipped' },
        })
        appLog('warn', 'cleanup', `Skipped (no service available): "${item.title}"`)
        skipped++
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Failed to delete "${item.title}":`, msg)
      appLog('error', 'cleanup', `Failed to delete "${item.title}": ${msg}`)
      await prisma.cleanupReportItem.update({
        where: { id: item.id },
        data: { status: 'error', errorMessage: msg },
      })
      failed++
    }
  }

  const finalStatus = failed > 0 ? 'COMPLETED' : 'COMPLETED'
  await prisma.cleanupReport.update({
    where: { id: reportId },
    data: { status: finalStatus, executedAt: new Date() },
  })

  appLog('info', 'cleanup', `Report ${reportId} complete — deleted ${deleted}, skipped ${skipped}, failed ${failed}`)

  // Send notifications
  try {
    const freedBytes = report.items
      .filter((_, i) => i < deleted)
      .reduce((sum, item) => sum + Number(item.fileSizeBytes), 0)

    await sendNotifications({
      type: 'cleanup_complete',
      reportId,
      deleted,
      failed,
      skipped,
      freedBytes,
    })
  } catch (err) {
    console.error('Notification error:', err)
  }

  return { deleted, failed, skipped }
}
