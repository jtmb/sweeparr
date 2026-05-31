import { NextResponse } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import { getDemoContext } from '@/lib/demo'

export async function POST(req: Request) {
  try {
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      return NextResponse.json({ error: 'Direct Plex deletions are disabled in demo mode' }, { status: 403 })
    }

    const body = await req.json() as { ratingKeys?: string[] }
    const ratingKeys = body.ratingKeys
    if (!Array.isArray(ratingKeys) || ratingKeys.length === 0) {
      return NextResponse.json({ error: 'ratingKeys array required' }, { status: 400 })
    }

    const cfg = await getConnectionConfig()
    if (!cfg.plexUrl || !cfg.plexToken) {
      return NextResponse.json({ error: 'Plex not configured' }, { status: 503 })
    }

    const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)

    const results: { ratingKey: string; ok: boolean; error?: string }[] = []
    for (const key of ratingKeys) {
      try {
        await plex.deleteMetadata(key)
        results.push({ ratingKey: key, ok: true })
      } catch (err: unknown) {
        results.push({ ratingKey: key, ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    const failed = results.filter((r) => !r.ok)
    return NextResponse.json(
      { deleted: results.filter((r) => r.ok).length, failed: failed.length, results },
      { status: failed.length === results.length ? 500 : 200 }
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
