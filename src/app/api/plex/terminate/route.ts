import { NextRequest, NextResponse } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import { getDemoContext } from '@/lib/demo'

export async function POST(req: NextRequest) {
  try {
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      // Simulate session termination — no real Plex call needed
      return NextResponse.json({ ok: true })
    }

    const { sessionId, reason } = await req.json() as { sessionId?: string; reason?: string }
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const cfg = await getConnectionConfig()
    if (!cfg.plexUrl || !cfg.plexToken) {
      return NextResponse.json({ error: 'Plex not configured' }, { status: 503 })
    }

    const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
    await plex.terminateSession(sessionId, reason)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
