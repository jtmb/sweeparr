import prisma from '@/lib/db/client'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import { createRadarrClient } from '@/lib/radarr/client'
import { createSonarrClient } from '@/lib/sonarr/client'
import { connectionFingerprint, playbackKeys, stableId } from './safety'
import { randomUUID } from 'crypto'
import { sendNotifications } from '@/lib/notifications'

type Options = { allowPlexDeletion?: boolean; resume?: boolean; excludeItemIds?: string[] }

/** One durable global fence also prevents two different reports deleting the same
 * object. No timed takeover: an expired lease cannot prove a DELETE stopped. */
export async function acquireReport(reportId: string, options: Options = {}): Promise<string> {
  const owner = randomUUID()
  await prisma.$transaction(async tx => {
    await tx.cleanupExecutionLock.create({ data: { id: 'global', owner, reportId } })
    const changed = await tx.cleanupReport.updateMany({
      where: { id: reportId, status: options.resume ? 'PAUSED' : 'READY' },
      data: { status: 'EXECUTING', pauseRequested: false, stopRequested: false,
        ...(!options.resume ? { allowPlexDeletion: options.allowPlexDeletion === true } : {}) },
    })
    if (changed.count !== 1) throw new Error('Report is not ready for execution')
    if (options.excludeItemIds?.length) await tx.cleanupReportItem.updateMany({
      where: { reportId, id: { in: options.excludeItemIds }, status: 'pending' }, data: { status: 'skipped' },
    })
  })
  return owner
}

export async function executeReport(reportId: string, options: Options = {}) {
  const owner = await acquireReport(reportId, options)
  return runReport(reportId, owner)
}

export async function runReport(reportId: string, owner: string) {
  let deleted = 0, failed = 0, skipped = 0, freedBytes = 0
  try {
    const lock = await prisma.cleanupExecutionLock.findUnique({ where: { id: 'global' } })
    if (lock?.owner !== owner || lock.reportId !== reportId) throw new Error('Execution ownership lost')
    const report = await prisma.cleanupReport.findUniqueOrThrow({ where: { id: reportId }, include: { items: { where: { status: 'pending' } } } })
    const cfg = await getConnectionConfig()
    const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
    const radarr = cfg.radarrUrl ? createRadarrClient(cfg.radarrUrl, cfg.radarrApiKey) : null
    const sonarr = cfg.sonarrUrl ? createSonarrClient(cfg.sonarrUrl, cfg.sonarrApiKey) : null

    for (const item of report.items) {
      const current = await prisma.cleanupReport.findUniqueOrThrow({ where: { id: reportId } })
      if (current.status !== 'EXECUTING') throw new Error('Execution state changed')
      if (current.stopRequested || current.pauseRequested) {
        await prisma.cleanupReport.update({ where: { id: reportId }, data: {
          status: current.stopRequested ? 'COMPLETED' : 'PAUSED', pauseRequested: false, stopRequested: false,
        } })
        return { deleted, failed, skipped }
      }
      let effectStarted = false
      try {
        if (!item.safetySnapshot) throw new Error('Legacy report: rescan and regenerate')
        const snapshot = JSON.parse(item.safetySnapshot) as { guid: string; stableId: number | null; server: string; connections: string; rule: { id: string } }
        if (!snapshot.rule?.id || !snapshot.guid || !snapshot.server || snapshot.connections !== connectionFingerprint(cfg)) throw new Error('Safety snapshot or integration changed')
        if ((await plex.getServerInfo()).machineIdentifier !== snapshot.server) throw new Error('Plex server changed')
        const metadata = await plex.getMetadata(item.plexRatingKey)
        if (metadata.guid !== snapshot.guid || metadata.type !== item.mediaType) throw new Error('Plex object identity changed')

        let remove: (() => Promise<void>) | null = null
        if (item.mediaType === 'movie' && item.radarrId) {
          if (!radarr || !snapshot.stableId || stableId(metadata, 'tmdb') !== snapshot.stableId) throw new Error('Movie identity unavailable')
          const movie = await radarr.getMovie(item.radarrId)
          if (movie.tmdbId !== snapshot.stableId) throw new Error('Radarr object identity changed')
          remove = () => radarr.deleteMovie(item.radarrId!, true)
        } else if (item.mediaType === 'show' && item.sonarrId) {
          if (!sonarr || !snapshot.stableId || stableId(metadata, 'tvdb') !== snapshot.stableId) throw new Error('Series identity unavailable')
          const series = await sonarr.getSeriesById(item.sonarrId)
          if (series.tvdbId !== snapshot.stableId) throw new Error('Sonarr object identity changed')
          remove = () => sonarr.deleteSeries(item.sonarrId!, true)
        } else if (report.allowPlexDeletion) {
          remove = () => plex.deleteMetadata(item.plexRatingKey)
        }
        if (!remove) throw new Error('Direct Plex deletion was not approved')
        // Always protect playback, including episodes mapped to their series.
        // Never degrade a failed live query into an empty set.
        const [sessions, onDeck] = await Promise.all([plex.getCurrentSessions(), plex.getOnDeck()])
        if (playbackKeys(sessions).has(item.plexRatingKey) || playbackKeys(onDeck).has(item.plexRatingKey) || metadata.viewOffset) throw new Error('Media is playing or in progress')
        if (connectionFingerprint(await getConnectionConfig()) !== snapshot.connections) throw new Error('Integration changed during execution')
        await prisma.$transaction(async tx => {
          const fence = await tx.cleanupExecutionLock.findUnique({ where: { id: 'global' } })
          const state = await tx.cleanupReport.findUniqueOrThrow({ where: { id: reportId } })
          if (fence?.owner !== owner || state.status !== 'EXECUTING' || state.pauseRequested || state.stopRequested) throw new Error('Execution interrupted')
          if (await tx.permanentExclusion.findUnique({ where: { plexRatingKey: item.plexRatingKey } })) throw new Error('Permanently excluded')
          if (await tx.cleanupReportItem.findFirst({ where: { plexRatingKey: item.plexRatingKey, status: { in: ['unknown', 'deleting'] } } })) throw new Error('Previous external outcome requires reconciliation')
          const claimed = await tx.cleanupReportItem.updateMany({ where: { id: item.id, status: 'pending' }, data: { status: 'deleting' } })
          if (claimed.count !== 1) throw new Error('Item already acquired')
        })
        effectStarted = true
        // No fallback after an attempted Arr effect, even a 404: the outcome can
        // be ambiguous. Regenerate/review rather than silently change authority.
        await remove()
        await prisma.cleanupReportItem.update({ where: { id: item.id }, data: { status: 'deleted' } })
        deleted++
        freedBytes += Number(item.fileSizeBytes)
      } catch (err) {
        await prisma.cleanupReportItem.updateMany({ where: { id: item.id, status: { in: ['pending', 'deleting'] } }, data: {
          status: effectStarted ? 'unknown' : 'skipped',
          errorMessage: effectStarted ? 'External outcome uncertain; reconcile manually before another attempt' : (err instanceof Error ? err.message : 'Safety validation failed'),
        } })
        if (effectStarted) failed++; else skipped++
      }
    }
    await prisma.cleanupReport.update({ where: { id: reportId }, data: { status: 'COMPLETED', executedAt: new Date() } })
  } catch (err) {
    await prisma.cleanupReport.updateMany({ where: { id: reportId, status: 'EXECUTING' }, data: { status: 'FAILED' } })
    throw err
  } finally {
    await prisma.cleanupExecutionLock.deleteMany({ where: { id: 'global', owner } })
  }
  await sendNotifications({ type: 'cleanup_complete', reportId, deleted, failed, skipped, freedBytes }).catch(() => {})
  return { deleted, failed, skipped }
}
