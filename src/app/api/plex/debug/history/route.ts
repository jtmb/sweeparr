import { NextResponse } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import axios from 'axios'

/** Temporary debug endpoint — hit /api/plex/debug/history to inspect raw Plex history */
export async function GET() {
  const cfg = await getConnectionConfig()
  if (!cfg.plexUrl || !cfg.plexToken) {
    return NextResponse.json({ error: 'Plex not configured' }, { status: 503 })
  }
  try {
    const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
    const map = await plex.getAllUsersHistory()
    // Also fetch raw first page so we can see the actual field names
    const raw = await axios.get(`${cfg.plexUrl}/status/sessions/history/all`, {
      headers: {
        'X-Plex-Token': cfg.plexToken,
        'X-Plex-Client-Identifier': 'sweeparr',
        Accept: 'application/json',
      },
      params: { sort: 'viewedAt:desc', 'X-Plex-Container-Size': 5 },
      timeout: 15000,
    })
    return NextResponse.json({
      mapSize: map.size,
      firstFiveKeys: [...map.entries()].slice(0, 5).map(([k, v]) => ({ key: k, ...v })),
      rawSample: raw.data?.MediaContainer?.Metadata?.slice(0, 3) ?? [],
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) })
  }
}
