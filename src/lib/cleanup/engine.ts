import { getConnectionConfig } from '@/lib/db/queries'
import prisma from '@/lib/db/client'
import { createPlexClient } from '@/lib/plex/client'
import { createRadarrClient } from '@/lib/radarr/client'
import { createSonarrClient } from '@/lib/sonarr/client'
import { daysSince } from '@/lib/utils'
import { markLibraryScanning, saveLibraryCache, getAllCachedSectionIds, getCachedLibrary } from '@/lib/cache/library'
import { syncLibraryCountToListCache } from '@/lib/cache/libraryList'
import { appLog } from '@/lib/logger'
import { sendNotifications } from '@/lib/notifications'
import type {
  EnrichedMediaItem,
  CleanupCandidate,
  CleanupReasonCode,
} from '@/types'

// ─── Build enriched media list for a given Plex section ──────────────────────

export async function getEnrichedLibraryMedia(sectionId: string): Promise<EnrichedMediaItem[]> {
  const cfg = await getConnectionConfig()
  const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
  const radarr = cfg.radarrUrl ? createRadarrClient(cfg.radarrUrl, cfg.radarrApiKey) : null
  const sonarr = cfg.sonarrUrl ? createSonarrClient(cfg.sonarrUrl, cfg.sonarrApiKey) : null

  const [sections, currentSessions, onDeck, globalHistory, accounts] = await Promise.all([
    plex.getSections(),
    plex.getCurrentSessions(),
    plex.getOnDeck(),
    plex.getAllUsersHistory().catch(() => new Map()),
    plex.getAllAccounts().catch(() => []),
  ])
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]))

  const section = sections.find((s) => s.key === sectionId)
  if (!section) return []

  const plexMedia = await plex.getSectionMedia(sectionId)
  const playingKeys = new Set(currentSessions.map((s) => s.ratingKey))
  const onDeckKeys = new Set(onDeck.map((s) => s.ratingKey))

  // Build Radarr/Sonarr lookup maps by title+year
  const radarrMovies = radarr ? await radarr.getMovies().catch(() => []) : []
  const sonarrSeries = sonarr ? await sonarr.getSeries().catch(() => []) : []

  const radarrMap = new Map(radarrMovies.map((m) => [`${m.title}|${m.year}`, m]))
  const sonarrMap = new Map(sonarrSeries.map((s) => [`${s.title}|${s.year}`, s]))

  const results: EnrichedMediaItem[] = []

  for (const item of plexMedia) {
    const histEntry = globalHistory.get(item.ratingKey)
    const fallbackWatchCount = item.viewCount ?? 0
    const fallbackLastViewed = item.lastViewedAt ? new Date(item.lastViewedAt * 1000) : undefined
    const watchCount = histEntry ? histEntry.watchCount : fallbackWatchCount
    const lastWatchedAt = histEntry
      ? new Date(histEntry.lastWatchedAt * 1000)
      : fallbackLastViewed

    const userWatches = histEntry
      ? [...histEntry.byUser.entries()]
          .map(([uid, u]) => ({
            userName: accountNames.get(uid) ?? `User ${uid}`,
            watchCount: u.watchCount,
            lastWatchedAt: new Date(u.lastWatchedAt * 1000),
          }))
          .sort((a, b) => b.lastWatchedAt.getTime() - a.lastWatchedAt.getTime())
      : []

    const isCurrentlyPlaying = playingKeys.has(item.ratingKey)
    const isInProgress = onDeckKeys.has(item.ratingKey) && !isCurrentlyPlaying

    const mediaType = section.type === 'show' ? 'show' : 'movie'
    const lookupKey = `${item.title}|${item.year ?? ''}`

    let fileSizeBytes = 0
    let radarrId: number | undefined
    let sonarrId: number | undefined
    let posterUrl: string | undefined

    if (mediaType === 'movie') {
      const match = radarrMap.get(lookupKey)
      if (match) {
        radarrId = match.id
        fileSizeBytes = match.sizeOnDisk ?? 0
        const poster = match.images.find((i) => i.coverType === 'poster')
        // Prefer external CDN URL; fall back to Plex thumb; last resort: relative Radarr path
        const remoteUrl = poster?.remoteUrl?.startsWith('http') ? poster.remoteUrl : undefined
        posterUrl = remoteUrl ?? item.thumb ?? poster?.url
      } else {
        fileSizeBytes = item.Media?.[0]?.Part?.reduce((s, p) => s + (p.size ?? 0), 0) ?? 0
      }
    } else {
      const match = sonarrMap.get(lookupKey)
      if (match) {
        sonarrId = match.id
        fileSizeBytes = match.statistics?.sizeOnDisk ?? 0
        const poster = match.images.find((i) => i.coverType === 'poster')
        // Prefer external CDN URL; fall back to Plex thumb; last resort: relative Sonarr path
        const remoteUrl = poster?.remoteUrl?.startsWith('http') ? poster.remoteUrl : undefined
        posterUrl = remoteUrl ?? item.thumb ?? poster?.url
      } else {
        fileSizeBytes = item.Media?.[0]?.Part?.reduce((s, p) => s + (p.size ?? 0), 0) ?? 0
      }
    }

    // Fall back to Plex thumb if still no poster (unmanaged items)
    if (!posterUrl && item.thumb) {
      posterUrl = item.thumb
    }

    let watchStatus: EnrichedMediaItem['watchStatus']
    if (isCurrentlyPlaying) {
      watchStatus = 'now_playing'
    } else if (isInProgress) {
      watchStatus = 'in_progress'
    } else if (watchCount > 0) {
      watchStatus = 'watched'
    } else {
      watchStatus = 'unwatched'
    }

    results.push({
      plexRatingKey: item.ratingKey,
      title: item.title,
      year: item.year,
      mediaType,
      addedAt: new Date(item.addedAt * 1000),
      lastWatchedAt,
      watchCount,
      fileSizeBytes,
      posterUrl,
      watchStatus,
      radarrId,
      sonarrId,
      isCurrentlyPlaying,
      isInProgress,
      libraryId: sectionId,
      libraryTitle: section.title,
      userWatches,
    })
  }

  return results
}

// ─── Scan a library and persist to cache ─────────────────────────────────────

export async function scanAndCacheLibrary(sectionId: string): Promise<void> {
  const cfg = await getConnectionConfig()
  const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
  const sections = await plex.getSections()
  const section = sections.find((s) => s.key === sectionId)
  if (!section) {
    appLog('warn', 'library-scan', `Section ${sectionId} not found in Plex — skipping`)
    return
  }

  appLog('info', 'library-scan', `Scanning section "${section.title}" (${sectionId})…`)
  try {
    const media = await getEnrichedLibraryMedia(sectionId)
    await saveLibraryCache(sectionId, section, media)
    // Keep the library list overview count in sync
    await syncLibraryCountToListCache(sectionId, media.length).catch(() => {})
    appLog('info', 'library-scan', `Scan complete — "${section.title}": ${media.length} items cached`)
  } catch (err) {
    appLog('error', 'library-scan', `Scan failed for "${section.title}": ${String(err)}`)
    // Clear the scanning flag so the UI doesn't hang
    await saveLibraryCache(sectionId, section, [])
  }
}

export async function scanAllLibraries(): Promise<void> {
  const cfg = await getConnectionConfig()
  if (!cfg.plexUrl || !cfg.plexToken) return
  const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
  const sections = await plex.getSections().catch(() => [])
  for (const section of sections) {
    await markLibraryScanning(section.key)
    await scanAndCacheLibrary(section.key)
  }
}

// ─── Evaluate cleanup candidates ─────────────────────────────────────────────

export function evaluateCandidate(
  item: EnrichedMediaItem,
  rule: {
    minAgeDays: number
    maxDaysSinceWatched?: number | null
    protectNeverWatched: boolean
    protectInProgress: boolean
    protectCurrentlyPlaying: boolean
  }
): CleanupReasonCode[] | null {
  if (rule.protectCurrentlyPlaying && item.isCurrentlyPlaying) return null
  if (rule.protectInProgress && item.isInProgress) return null

  const ageInDays = daysSince(item.addedAt)
  if (ageInDays < rule.minAgeDays) return null

  const reasons: CleanupReasonCode[] = []

  if (item.watchCount === 0) {
    if (rule.protectNeverWatched) return null
    reasons.push('NEVER_WATCHED')
  } else {
    // Item has been watched at least once
    if (rule.maxDaysSinceWatched) {
      if (item.lastWatchedAt) {
        const sinceWatched = daysSince(item.lastWatchedAt)
        if (sinceWatched >= rule.maxDaysSinceWatched) {
          reasons.push('STALE_WATCHED')
        } else {
          // Watched recently — not a candidate
          return null
        }
      } else {
        // No lastWatchedAt recorded — treat as stale since we can't verify recency
        reasons.push('STALE_WATCHED')
      }
    } else {
      reasons.push('OLD_AND_WATCHED')
    }
  }

  if (reasons.length === 0) return null
  return reasons
}

// ─── Generate a full report ───────────────────────────────────────────────────

export async function generateReport(
  triggeredBy: 'manual' | 'scheduled' = 'manual',
  ruleIds?: string[]
): Promise<string> {
  // When ruleIds is provided, run only those rules (regardless of enabled state).
  // Otherwise fall back to all enabled rules.
  const rules = ruleIds && ruleIds.length > 0
    ? await prisma.cleanupRule.findMany({ where: { id: { in: ruleIds } } })
    : await prisma.cleanupRule.findMany({ where: { enabled: true } })
  if (rules.length === 0) {
    throw new Error('No cleanup rules found. Configure rules in Settings.')
  }

  const sectionIds = await getAllCachedSectionIds()
  if (sectionIds.length === 0) {
    throw new Error('No library data cached. Scan at least one library first.')
  }

  const report = await prisma.cleanupReport.create({
    data: { status: 'DRAFT', triggeredBy },
  })

  let totalItems = 0
  let totalSizeBytes = BigInt(0)

  for (const sectionId of sectionIds) {
    const cache = await getCachedLibrary(sectionId)
    if (!cache || cache.media.length === 0) continue

    for (const item of cache.media) {
      // Apply rules — use global rules or library-specific ones.
      // Match on sectionId (key, e.g. "1") OR section title (e.g. "Movies") to
      // handle rules created before the dropdown was fixed to store the key.
      const sectionTitle = cache.section.title
      const applicableRules = rules.filter(
        (r) => !r.libraryId || r.libraryId === sectionId || r.libraryId === sectionTitle
      )

      let reasons: CleanupReasonCode[] | null = null
      let matchedRule: (typeof applicableRules)[0] | null = null
      for (const rule of applicableRules) {
        const r = evaluateCandidate(item, {
          minAgeDays: rule.minAgeDays,
          maxDaysSinceWatched: rule.maxDaysSinceWatched ?? undefined,
          protectNeverWatched: rule.protectNeverWatched,
          protectInProgress: rule.protectInProgress,
          protectCurrentlyPlaying: rule.protectCurrentlyPlaying,
        })
        if (r) {
          reasons = r
          matchedRule = rule
          break
        }
      }

      if (!reasons) continue

      // Track whether this candidate is managed by Radarr/Sonarr.
      // Unmanaged items can still be optionally deleted via Plex at execution time.
      const arrManaged =
        (item.mediaType === 'movie' && item.radarrId) ||
        (item.mediaType === 'show' && item.sonarrId)

      await prisma.cleanupReportItem.create({
        data: {
          reportId: report.id,
          mediaType: item.mediaType,
          radarrId: item.radarrId ?? null,
          sonarrId: item.sonarrId ?? null,
          plexRatingKey: item.plexRatingKey,
          title: item.title,
          year: item.year ?? null,
          addedAt: item.addedAt,
          lastWatchedAt: item.lastWatchedAt ?? null,
          watchCount: item.watchCount,
          fileSizeBytes: BigInt(item.fileSizeBytes),
          reasons: arrManaged ? JSON.stringify(reasons) : JSON.stringify([...reasons, 'NO_ARR_MATCH']),
          ruleName: matchedRule?.name ?? null,
          posterPath: item.posterUrl ?? null,
          status: 'pending',
        },
      })

      totalItems++
      totalSizeBytes += BigInt(item.fileSizeBytes)
    }
  }

  await prisma.cleanupReport.update({
    where: { id: report.id },
    data: {
      status: 'READY',
      totalItems,
      totalSizeBytes,
    },
  })

  await sendNotifications({
    type: 'report_ready',
    reportId: report.id,
    deleted: totalItems,
  }).catch((e) => appLog('error', 'notifications', `report_ready notification failed: ${String(e)}`))

  return report.id
}
