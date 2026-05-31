import { NextResponse, after } from 'next/server'
import {
  readLibraryListCache,
  markLibraryListScanning,
  fetchAndSaveLibraryList,
} from '@/lib/cache/libraryList'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import { appLog } from '@/lib/logger'
import { getDemoContext } from '@/lib/demo'

// POST — force a rescan of the library list + trigger a Plex library file scan
export async function POST() {
  try {
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      // No-op in demo mode — data is already seeded
      return NextResponse.json({ ok: true, scanning: false })
    }

    const existing = await readLibraryListCache()
    await markLibraryListScanning(existing)

    after(async () => {
      // 1. Tell Plex to scan each section for new/removed files
      try {
        const cfg = await getConnectionConfig()
        if (cfg.plexUrl && cfg.plexToken) {
          const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
          const sections = await plex.getSections()
          const targets = sections.filter((s) => ['movie', 'show'].includes(s.type))
          const results = await Promise.all(targets.map((s) => plex.refreshSection(s.key)))
          const ok = results.filter(Boolean).length
          appLog('info', 'library-list-scan', `Triggered Plex scan on ${ok}/${targets.length} section(s)`)
        }
      } catch (e: unknown) {
        appLog('warn', 'library-list-scan', `Plex scan trigger failed: ${e instanceof Error ? e.message : String(e)}`)
      }

      // 2. Rebuild our internal library list cache
      await fetchAndSaveLibraryList()
    })

    return NextResponse.json({ ok: true, scanning: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET — poll for scan status
export async function GET() {
  try {
    const cached = await readLibraryListCache()
    return NextResponse.json({
      scanning: cached?.scanning ?? false,
      cachedAt: cached?.cachedAt ?? null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
