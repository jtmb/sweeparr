import { NextResponse } from 'next/server'
import { getAllCachedSectionIds, getCachedLibrary } from '@/lib/cache/library'
import { readLibraryListCache } from '@/lib/cache/libraryList'
import { getDemoContext, demoPrisma } from '@/lib/demo'
import { DEMO_LIBRARIES } from '@/lib/demo/data'
import type { EnrichedMediaItem, PlexLibrary } from '@/types'

function deserializeDemoMedia(raw: Record<string, unknown>): EnrichedMediaItem {
  return {
    ...(raw as unknown as EnrichedMediaItem),
    addedAt: new Date(raw.addedAt as string),
    lastWatchedAt: raw.lastWatchedAt ? new Date(raw.lastWatchedAt as string) : undefined,
    userWatches: ((raw.userWatches ?? []) as Array<Record<string, unknown>>).map((w) => ({
      ...(w as { userName: string; watchCount: number }),
      lastWatchedAt: new Date(w.lastWatchedAt as string),
    })),
  }
}

export async function GET() {
  try {
    const { demoMode } = await getDemoContext()

    let caches: Array<{ section: PlexLibrary; media: EnrichedMediaItem[]; scannedAt: Date; scanning: boolean }>
    let listCacheLibraries: Array<{ key: string; title: string; type: string; itemCount: number; totalSize: number }>

    if (demoMode) {
      // Read entirely from demo.db — never touch real library caches
      const demoRows = await demoPrisma.libraryCache.findMany()
      caches = demoRows.map((row) => ({
        section: JSON.parse(row.sectionJson) as PlexLibrary,
        media: (JSON.parse(row.mediaJson) as Array<Record<string, unknown>>).map(deserializeDemoMedia),
        scannedAt: row.scannedAt,
        scanning: false,
      }))
      const listRow = await demoPrisma.settings.findUnique({ where: { key: 'libraryListCache' } })
      if (listRow?.value) {
        try {
          const parsed = JSON.parse(listRow.value) as { libraries: typeof listCacheLibraries }
          listCacheLibraries = parsed.libraries ?? []
        } catch { listCacheLibraries = [] }
      } else {
        listCacheLibraries = DEMO_LIBRARIES.map((l) => ({ key: l.key, title: l.title, type: l.type, itemCount: 0, totalSize: 0 }))
      }
    } else {
      const sectionIds = await getAllCachedSectionIds()
      caches = ((await Promise.all(sectionIds.map((id) => getCachedLibrary(id)))).filter(Boolean)) as typeof caches
      const listCache = await readLibraryListCache()
      listCacheLibraries = listCache?.libraries ?? []
    }

    const allMedia = caches.flatMap((c) => c!.media)
    const allMovies = allMedia.filter((m) => m.mediaType === 'movie')
    const allShows = allMedia.filter((m) => m.mediaType === 'show')

    // Most watched movies (by total watchCount)
    const mostWatchedMovies = [...allMovies]
      .filter((m) => m.watchCount > 0)
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, 5)
      .map((m) => ({ title: m.title, posterUrl: m.posterUrl ?? null, watchCount: m.watchCount, year: m.year }))

    // Most watched TV shows (by total watchCount = episodes watched)
    const mostWatchedShows = [...allShows]
      .filter((s) => s.watchCount > 0)
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, 5)
      .map((s) => ({ title: s.title, posterUrl: s.posterUrl ?? null, watchCount: s.watchCount, year: s.year }))

    // Most active libraries (by total play count)
    const libraryPlayCounts = new Map<string, number>()
    for (const cache of caches) {
      if (!cache) continue
      const total = cache.media.reduce((s, m) => s + m.watchCount, 0)
      libraryPlayCounts.set(cache.section.title, total)
    }
    const mostActiveLibraries = listCacheLibraries
      .map((l) => ({ title: l.title, type: l.type, itemCount: l.itemCount, playCount: libraryPlayCounts.get(l.title) ?? 0 }))
      .sort((a, b) => b.playCount - a.playCount)

    // Most active users (sum userWatches across all media)
    const userPlayMap = new Map<string, number>()
    for (const item of allMedia) {
      for (const uw of item.userWatches) {
        userPlayMap.set(uw.userName, (userPlayMap.get(uw.userName) ?? 0) + uw.watchCount)
      }
    }
    const mostActiveUsers = [...userPlayMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([userName, playCount]) => ({ userName, playCount }))

    // Recently watched (by lastWatchedAt desc)
    const recentlyWatched = [...allMedia]
      .filter((m) => m.lastWatchedAt)
      .sort((a, b) => (b.lastWatchedAt?.getTime() ?? 0) - (a.lastWatchedAt?.getTime() ?? 0))
      .slice(0, 8)
      .map((m) => ({
        plexRatingKey: m.plexRatingKey,
        title: m.title,
        posterUrl: m.posterUrl ?? null,
        watchedAt: m.lastWatchedAt!.toISOString(),
        mediaType: m.mediaType,
        year: m.year,
      }))

    // Recently added (by addedAt desc)
    const recentlyAdded = [...allMedia]
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
      .slice(0, 30)
      .map((m) => ({
        plexRatingKey: m.plexRatingKey,
        title: m.title,
        posterUrl: m.posterUrl ?? null,
        addedAt: m.addedAt.toISOString(),
        mediaType: m.mediaType,
        year: m.year,
      }))

    return NextResponse.json({
      mostWatchedMovies,
      mostWatchedShows,
      mostActiveLibraries,
      mostActiveUsers,
      recentlyWatched,
      recentlyAdded,
      libraryList: listCacheLibraries.map((l) => ({
        key: l.key,
        title: l.title,
        type: l.type,
        itemCount: l.itemCount,
        playCount: libraryPlayCounts.get(l.title) ?? 0,
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
