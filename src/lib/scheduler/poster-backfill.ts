/**
 * Poster backfill — runs after a library scan to fill in missing posters.
 *
 * Items that came from Plex but couldn't be matched to Radarr/Sonarr during
 * the main scan will have no posterUrl (or only a relative Plex thumb path).
 * This job attempts a second-pass title+year match against Radarr and Sonarr
 * and patches the in-memory cache entries with the external poster URL so the
 * UI can display them.
 */

import { getConnectionConfig } from '@/lib/db/queries'
import { getAllCachedSectionIds, getCachedLibrary, saveLibraryCache } from '@/lib/cache/library'
import { createRadarrClient } from '@/lib/radarr/client'
import { createSonarrClient } from '@/lib/sonarr/client'
import { appLog } from '@/lib/logger'
import { markJobStarted, markJobFinished } from '@/lib/scheduler/job-status'
import type { EnrichedMediaItem } from '@/types'

// Matches both Plex internal thumbs and relative Radarr/Sonarr paths that
// are only accessible via the image proxy — both are candidates for upgrading
// to a real external CDN URL.
const NEEDS_UPGRADE_RE = /^(\/library\/metadata\/|\/MediaCover\/|\/MediaCover\b)/

/** Return true if the posterUrl is missing or only a proxied relative path */
function isMissingOrPlexOnly(posterUrl?: string): boolean {
  if (!posterUrl) return true
  return NEEDS_UPGRADE_RE.test(posterUrl)
}

/** Pick the best external poster URL from an images array.
 *  Only returns real http(s) CDN URLs — relative proxy paths are not useful
 *  here because we're trying to UPGRADE from them, not replace with another. */
function pickPosterUrl(images: Array<{ coverType: string; url: string; remoteUrl?: string }>): string | undefined {
  const poster = images.find((i) => i.coverType === 'poster')
  if (!poster) return undefined
  return poster.remoteUrl?.startsWith('http') ? poster.remoteUrl : undefined
}

export async function backfillPosters(): Promise<{ patched: number; sections: number }> {
  const cfg = await getConnectionConfig()

  const radarr = cfg.radarrUrl ? createRadarrClient(cfg.radarrUrl, cfg.radarrApiKey) : null
  const sonarr = cfg.sonarrUrl ? createSonarrClient(cfg.sonarrUrl, cfg.sonarrApiKey) : null

  if (!radarr && !sonarr) {
    appLog('warn', 'poster-backfill', 'No Radarr/Sonarr configured — skipping backfill')
    return { patched: 0, sections: 0 }
  }

  appLog('info', 'poster-backfill', 'Starting poster backfill pass…')
  markJobStarted('poster-backfill', 'Poster Backfill')

  try {
    const [radarrMovies, sonarrSeries] = await Promise.all([
      radarr ? radarr.getMovies().catch((e) => { appLog('warn', 'poster-backfill', `Radarr fetch failed: ${String(e)}`); return [] }) : Promise.resolve([]),
      sonarr ? sonarr.getSeries().catch((e) => { appLog('warn', 'poster-backfill', `Sonarr fetch failed: ${String(e)}`); return [] }) : Promise.resolve([]),
    ])

    appLog('info', 'poster-backfill', `Loaded ${radarrMovies.length} Radarr movies, ${sonarrSeries.length} Sonarr series`)

    // Primary map: "Title|Year"  — exact match
    const radarrExact = new Map(radarrMovies.map((m) => [`${m.title.toLowerCase()}|${m.year}`, m]))
    const sonarrExact = new Map(sonarrSeries.map((s) => [`${s.title.toLowerCase()}|${s.year}`, s]))
    // Fallback map: title only (for items where year is missing/mismatched)
    const radarrByTitle = new Map(radarrMovies.map((m) => [m.title.toLowerCase(), m]))
    const sonarrByTitle = new Map(sonarrSeries.map((s) => [s.title.toLowerCase(), s]))

    const sectionIds = await getAllCachedSectionIds()
    appLog('info', 'poster-backfill', `Found ${sectionIds.length} cached section(s) to check`)

    let totalPatched = 0
    let totalMissing = 0
    let totalScanned = 0
    let sectionsPatched = 0

    for (const sectionId of sectionIds) {
      const cached = await getCachedLibrary(sectionId)
      if (!cached) {
        appLog('warn', 'poster-backfill', `Section ${sectionId}: no cache entry found — skipping`)
        continue
      }
      if (cached.scanning) {
        appLog('warn', 'poster-backfill', `Section "${cached.section.title}": still scanning — skipping`)
        continue
      }

      const missing = cached.media.filter((item) => isMissingOrPlexOnly(item.posterUrl))
      totalScanned += cached.media.length
      totalMissing += missing.length

      if (missing.length === 0) {
        appLog('info', 'poster-backfill', `Section "${cached.section.title}": all ${cached.media.length} items have posters`)
        continue
      }

      appLog('info', 'poster-backfill', `Section "${cached.section.title}": ${missing.length}/${cached.media.length} items need posters`)

      let sectionPatched = 0
      const updatedMedia: EnrichedMediaItem[] = cached.media.map((item) => {
        if (!isMissingOrPlexOnly(item.posterUrl)) return item

        const titleLower = item.title.toLowerCase()
        const exactKey = `${titleLower}|${item.year ?? ''}`

        let newPosterUrl: string | undefined

        if (item.mediaType === 'movie') {
          const match = radarrExact.get(exactKey) ?? radarrByTitle.get(titleLower)
          if (match) newPosterUrl = pickPosterUrl(match.images)
        } else {
          const match = sonarrExact.get(exactKey) ?? sonarrByTitle.get(titleLower)
          if (match) newPosterUrl = pickPosterUrl(match.images)
        }

        if (newPosterUrl) {
          sectionPatched++
          return { ...item, posterUrl: newPosterUrl }
        }
        return item
      })

      if (sectionPatched > 0) {
        await saveLibraryCache(sectionId, cached.section, updatedMedia)
        totalPatched += sectionPatched
        sectionsPatched++
        appLog('info', 'poster-backfill', `Section "${cached.section.title}": patched ${sectionPatched} poster(s)`)
      } else {
        appLog('warn', 'poster-backfill', `Section "${cached.section.title}": ${missing.length} items still missing posters — no Radarr/Sonarr match found`)
      }
    }

    appLog(
      'info',
      'poster-backfill',
      `Backfill complete — scanned ${totalScanned} items, found ${totalMissing} missing, patched ${totalPatched} across ${sectionsPatched}/${sectionIds.length} section(s)`
    )
    return { patched: totalPatched, sections: sectionsPatched }
  } finally {
    markJobFinished('poster-backfill')
  }
}
