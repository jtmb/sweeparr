import { NextResponse } from 'next/server'
import { backfillPosters } from '@/lib/scheduler/poster-backfill'

// POST /api/posters/backfill — manually trigger a poster backfill pass
export async function POST() {
  try {
    const result = await backfillPosters()
    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
