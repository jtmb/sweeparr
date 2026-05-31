import { NextResponse, after } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import { scanAndCacheLibrary } from '@/lib/cleanup/engine'
import { getCachedLibrary, markLibraryScanning } from '@/lib/cache/library'
import { createPlexClient } from '@/lib/plex/client'
import { getDemoContext, demoPrisma } from '@/lib/demo'
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { demoMode } = await getDemoContext()

    if (demoMode) {
      // Read directly from demo.db — never touch real libraryCache
      const row = await demoPrisma.libraryCache.findUnique({ where: { sectionId: id } })
      if (!row) return NextResponse.json({ error: 'Library not found' }, { status: 404 })
      return NextResponse.json({
        section: JSON.parse(row.sectionJson) as PlexLibrary,
        media: (JSON.parse(row.mediaJson) as Array<Record<string, unknown>>).map(deserializeDemoMedia),
        scannedAt: row.scannedAt,
        scanning: false,
        fromCache: true,
      })
    }

    const cfg = await getConnectionConfig()
    if (!cfg.plexUrl || !cfg.plexToken) {
      return NextResponse.json({ error: 'Plex not configured' }, { status: 503 })
    }

    const cached = await getCachedLibrary(id)

    if (cached) {
      // Return cached data immediately — no auto-rescan on every visit.
      // Rescans are triggered by the scheduler or the manual Rescan button.
      return NextResponse.json({
        section: cached.section,
        media: cached.media,
        scannedAt: cached.scannedAt,
        scanning: cached.scanning,
        fromCache: true,
      })
    }

    // No cache yet — verify section exists, then kick first-time scan
    const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
    const sections = await plex.getSections()
    const section = sections.find((s) => s.key === id)
    if (!section) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 })
    }

    await markLibraryScanning(id)
    after(async () => { await scanAndCacheLibrary(id) })

    return NextResponse.json({
      section,
      media: [],
      scannedAt: null,
      scanning: true,
      fromCache: false,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
