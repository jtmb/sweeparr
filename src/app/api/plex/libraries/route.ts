import { NextResponse, after } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import {
  readLibraryListCache,
  markLibraryListScanning,
  fetchAndSaveLibraryList,
} from '@/lib/cache/libraryList'
import { getDemoContext, demoPrisma } from '@/lib/demo'

export async function GET() {
  try {
    const { demoMode } = await getDemoContext()

    if (demoMode) {
      // Read library list from demo.db settings — never touch real DB
      const row = await demoPrisma.settings.findUnique({ where: { key: 'libraryListCache' } })
      if (!row?.value) return NextResponse.json({ libraries: [], cachedAt: null, scanning: false, fromCache: false })
      try {
        const cached = JSON.parse(row.value) as { libraries: unknown[]; cachedAt: string | null; scanning: boolean }
        return NextResponse.json({ libraries: cached.libraries ?? [], cachedAt: cached.cachedAt ?? null, scanning: false, fromCache: true })
      } catch {
        return NextResponse.json({ libraries: [], cachedAt: null, scanning: false, fromCache: false })
      }
    }

    const cfg = await getConnectionConfig()
    if (!cfg.plexUrl || !cfg.plexToken) {
      return NextResponse.json({ error: 'Plex not configured' }, { status: 503 })
    }

    const cached = await readLibraryListCache()

    if (cached) {
      // Return cached data immediately — no auto-rescan on every visit.
      // Rescans are triggered by the scheduler or the manual Rescan button.
      return NextResponse.json({
        libraries: cached.libraries,
        cachedAt: cached.cachedAt,
        scanning: cached.scanning,
        fromCache: true,
      })
    }

    // No cache — kick first-time scan
    await markLibraryListScanning()
    after(async () => { await fetchAndSaveLibraryList() })

    return NextResponse.json({ libraries: [], cachedAt: null, scanning: true, fromCache: false })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
