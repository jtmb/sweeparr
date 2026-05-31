import { NextResponse } from 'next/server'
import { isDemoMode, invalidateDemoModeCache, seedDemoData, clearDemoData } from '@/lib/demo'
import { clearAllSessions } from '@/lib/demo/session'

export const dynamic = 'force-dynamic'

// POST /api/settings/system/reset — wipe all session data and re-seed demo data
export async function POST() {
  try {
    const demo = await isDemoMode()
    if (!demo) {
      return NextResponse.json({ error: 'Demo mode is not enabled' }, { status: 400 })
    }

    // Clear all visitor sessions and demo DB data, then re-seed
    await clearAllSessions()
    await clearDemoData()
    invalidateDemoModeCache()

    // Re-enable and re-seed
    const { setSetting } = await import('@/lib/db/queries')
    await setSetting('demoMode', 'true')
    invalidateDemoModeCache()
    await seedDemoData()

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
