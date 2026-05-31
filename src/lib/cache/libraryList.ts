import { getConnectionConfig, getSetting, setSetting } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import { createRadarrClient } from '@/lib/radarr/client'
import { createSonarrClient } from '@/lib/sonarr/client'

const CACHE_KEY = 'libraryListCache'

export interface LibraryEntry {
  key: string
  title: string
  type: string
  itemCount: number
  totalSize: number
}

export interface LibraryListCache {
  libraries: LibraryEntry[]
  cachedAt: string | null
  scanning: boolean
  scanStartedAt?: string | null
}

const STALE_SCAN_MS = 15 * 60 * 1000 // 15 minutes

/** Returns true if the scanning flag has been stuck for > 15 minutes */
function isScanStale(cache: LibraryListCache): boolean {
  if (!cache.scanning) return false
  if (!cache.scanStartedAt) return true // no start timestamp = stale legacy flag
  return Date.now() - new Date(cache.scanStartedAt).getTime() > STALE_SCAN_MS
}

export async function readLibraryListCache(): Promise<LibraryListCache | null> {
  const raw = await getSetting(CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LibraryListCache
    // Auto-clear stale scanning flag so the UI never gets stuck
    if (isScanStale(parsed)) {
      const cleared = { ...parsed, scanning: false, scanStartedAt: null }
      await setSetting(CACHE_KEY, JSON.stringify(cleared))
      return cleared
    }
    return parsed
  } catch { return null }
}

export async function markLibraryListScanning(existing?: LibraryListCache | null): Promise<void> {
  const base = existing ?? { libraries: [], cachedAt: null, scanning: false }
  await setSetting(CACHE_KEY, JSON.stringify({ ...base, scanning: true, scanStartedAt: new Date().toISOString() }))
}

export async function fetchAndSaveLibraryList(): Promise<void> {
  try {
    const cfg = await getConnectionConfig()
    if (!cfg.plexUrl || !cfg.plexToken) return

    const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
    const sections = await plex.getSections()

    const radarr = cfg.radarrUrl ? createRadarrClient(cfg.radarrUrl, cfg.radarrApiKey) : null
    const sonarr = cfg.sonarrUrl ? createSonarrClient(cfg.sonarrUrl, cfg.sonarrApiKey) : null

    // Filter first, then fetch counts only for matching sections (avoids index mismatch)
    const targetSections = sections.filter((s) =>
      ['movie', 'show', 'artist', 'photo'].includes(s.type)
    )

    const [radarrMovies, sonarrSeries, ...sectionCounts] = await Promise.all([
      radarr ? radarr.getMovies().catch(() => []) : Promise.resolve([]),
      sonarr ? sonarr.getSeries().catch(() => []) : Promise.resolve([]),
      ...targetSections.map((s) => plex.getSectionCount(s.key).catch(() => 0)),
    ])

    const radarrSize = radarrMovies.reduce((s, m) => s + (m.sizeOnDisk ?? 0), 0)
    const sonarrSize = sonarrSeries.reduce(
      (s, m) => s + ((m.statistics as { sizeOnDisk?: number } | undefined)?.sizeOnDisk ?? 0),
      0
    )

    const libraries: LibraryEntry[] = targetSections.map((s, i) => ({
        key: s.key,
        title: s.title,
        type: s.type,
        itemCount: sectionCounts[i] as number,
        totalSize: s.type === 'movie' ? radarrSize : s.type === 'show' ? sonarrSize : 0,
      }))

    await setSetting(CACHE_KEY, JSON.stringify({ libraries, cachedAt: new Date().toISOString(), scanning: false }))
  } catch (err) {
    console.error('[LibraryListCache] Scan failed:', err)
    // Clear scanning flag even on failure
    const existing = await readLibraryListCache()
    if (existing) {
      await setSetting(CACHE_KEY, JSON.stringify({ ...existing, scanning: false }))
    }
  }
}

/**
 * After a per-library scan completes, patch the item count in the list cache so the
 * Libraries overview stays in sync without needing a full list rescan.
 */
export async function syncLibraryCountToListCache(
  sectionKey: string,
  itemCount: number
): Promise<void> {
  const cache = await readLibraryListCache()
  if (!cache) return
  const updated = cache.libraries.map((lib) =>
    lib.key === sectionKey ? { ...lib, itemCount } : lib
  )
  await setSetting(CACHE_KEY, JSON.stringify({ ...cache, libraries: updated }))
}
