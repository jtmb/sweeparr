import { NextResponse } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import { getDemoContext } from '@/lib/demo'
import { DEMO_SESSIONS } from '@/lib/demo/data'

export async function GET() {
  try {
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      return NextResponse.json({ sessions: DEMO_SESSIONS, onDeck: [] })
    }

    const cfg = await getConnectionConfig()
    if (!cfg.plexUrl || !cfg.plexToken) {
      return NextResponse.json({ sessions: [], onDeck: [] })
    }
    const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
    const [sessions, onDeck] = await Promise.all([
      plex.getCurrentSessions(),
      plex.getOnDeck(),
    ])
    return NextResponse.json({ sessions, onDeck })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
