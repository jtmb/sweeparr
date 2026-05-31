import { NextResponse } from 'next/server'
import prisma from '@/lib/db/client'
import { getDemoContext, saveDemoSession } from '@/lib/demo'
import type { DemoExclusion } from '@/lib/demo/session'

export async function GET() {
  try {
    const { demoMode, session } = await getDemoContext()

    if (demoMode) {
      return NextResponse.json(session?.exclusions ?? [])
    }

    const [exclusions, caches] = await Promise.all([
      prisma.permanentExclusion.findMany({ orderBy: { addedAt: 'desc' } }),
      prisma.libraryCache.findMany({ select: { mediaJson: true } }),
    ])

    // Build plexRatingKey → watchStatus lookup from all library caches
    const watchMap = new Map<string, string>()
    for (const cache of caches) {
      try {
        const items = JSON.parse(cache.mediaJson) as Array<{ plexRatingKey: string; watchStatus: string }>
        for (const item of items) {
          if (item.plexRatingKey && item.watchStatus) {
            watchMap.set(item.plexRatingKey, item.watchStatus)
          }
        }
      } catch { /* ignore malformed cache entries */ }
    }

    const enriched = exclusions.map((e) => ({
      ...e,
      watchStatus: watchMap.get(e.plexRatingKey) ?? null,
    }))

    return NextResponse.json(enriched)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

interface ExclusionInput {
  plexRatingKey: string
  title: string
  year?: number | null
  mediaType: string
  posterPath?: string | null
}

export async function POST(req: Request) {
  try {
    const { demoMode, sessionId, session } = await getDemoContext()
    const body = await req.json() as { items: ExclusionInput[] }
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'items array required' }, { status: 400 })
    }

    if (demoMode) {
      if (sessionId && session) {
        const toAdd: DemoExclusion[] = body.items.map((item) => ({
          id: crypto.randomUUID(),
          plexRatingKey: item.plexRatingKey,
          title: item.title,
          year: item.year ?? null,
          mediaType: item.mediaType,
          posterPath: item.posterPath ?? null,
          addedAt: new Date().toISOString(),
          watchStatus: null,
        }))
        // Skip duplicates
        const existingKeys = new Set(session.exclusions.map((e) => e.plexRatingKey))
        const newOnes = toAdd.filter((e) => !existingKeys.has(e.plexRatingKey))
        session.exclusions.push(...newOnes)
        await saveDemoSession(sessionId, session)
        return NextResponse.json({ added: newOnes.length, items: newOnes }, { status: 201 })
      }
      return NextResponse.json({ added: 0, items: [] }, { status: 201 })
    }

    // Upsert each item — update title/poster if the key already exists
    const results = await Promise.all(
      body.items.map((item) =>
        prisma.permanentExclusion.upsert({
          where: { plexRatingKey: item.plexRatingKey },
          update: {
            title: item.title,
            year: item.year ?? null,
            mediaType: item.mediaType,
            posterPath: item.posterPath ?? null,
          },
          create: {
            plexRatingKey: item.plexRatingKey,
            title: item.title,
            year: item.year ?? null,
            mediaType: item.mediaType,
            posterPath: item.posterPath ?? null,
          },
        })
      )
    )

    return NextResponse.json({ added: results.length, items: results }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
