import { NextResponse, after } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import { scanAndCacheLibrary } from '@/lib/cleanup/engine'
import { getCachedLibrary, markLibraryScanning } from '@/lib/cache/library'
import { backfillPosters } from '@/lib/scheduler/poster-backfill'
import { createPlexClient } from '@/lib/plex/client'
import { appLog } from '@/lib/logger'
import { getDemoContext } from '@/lib/demo'

// POST /api/plex/library/[id]/scan — force a cache refresh
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { demoMode } = await getDemoContext()

    if (demoMode) {
      // Simulate scan completion — data is already seeded, nothing to refresh
      return NextResponse.json({ ok: true, scanning: false })
    }

    const cfg = await getConnectionConfig()
    if (!cfg.plexUrl || !cfg.plexToken) {
      return NextResponse.json({ error: 'Plex not configured' }, { status: 503 })
    }

    await markLibraryScanning(id)
    after(async () => {
      // Tell Plex to scan this section for new/removed files
      try {
        const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
        const ok = await plex.refreshSection(id)
        appLog('info', 'library-scan', `Plex scan ${ok ? 'triggered' : 'failed'} for section ${id}`)
      } catch (e: unknown) {
        appLog('warn', 'library-scan', `Plex scan trigger failed for section ${id}: ${e instanceof Error ? e.message : String(e)}`)
      }

      await scanAndCacheLibrary(id)
      await backfillPosters().catch((e) => console.error('[PosterBackfill] Error:', e))
    })

    return NextResponse.json({ ok: true, scanning: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/plex/library/[id]/scan — poll for scan status
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cached = await getCachedLibrary(id)
    return NextResponse.json({
      scanning: cached?.scanning ?? false,
      scannedAt: cached?.scannedAt ?? null,
      hasData: !!cached && cached.media.length > 0,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
