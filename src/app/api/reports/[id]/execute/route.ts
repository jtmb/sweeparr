import { guardApi } from '@/lib/auth/guard'
import { NextResponse, after } from 'next/server'
import { acquireReport, runReport } from '@/lib/cleanup/executor'
import prisma from '@/lib/db/client'
import { getDemoContext, saveDemoSession } from '@/lib/demo'

interface ExclusionInput {
  plexRatingKey: string
  title: string
  year?: number | null
  mediaType: string
  posterPath?: string | null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardApi('demo')
  if (denied) return denied
  try {
    const { id } = await params
    const { demoMode, sessionId, session } = await getDemoContext()

    if (demoMode) {
      if (sessionId && session) {
        const report = session.reports.find((r) => r.id === id)
        if (report && (report.status === 'READY' || report.status === 'PAUSED')) {
          report.items.forEach((item) => { if (item.status === 'pending') item.status = 'deleted' })
          report.status = 'COMPLETED'
          report.executedAt = new Date().toISOString()
          await saveDemoSession(sessionId, session)
        }
      }
      return NextResponse.json({ ok: true }, { status: 202 })
    }

    let body: {
      excludeItemIds?: string[]
      allowPlexDeletion?: boolean
      saveExclusionItems?: ExclusionInput[]
    } = {}
    try { body = await req.json() } catch { /* no body is fine */ }

    const excludeItemIds = body.excludeItemIds ?? []
    const allowPlexDeletion = body.allowPlexDeletion === true
    const saveExclusionItems = body.saveExclusionItems ?? []


    // Persist any items the user wants added to the permanent exclusion list
    if (saveExclusionItems.length > 0) {
      await Promise.all(
        saveExclusionItems.map((item) =>
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
    }

    let owner: string
    try { owner = await acquireReport(id, { allowPlexDeletion, excludeItemIds }) }
    catch { return NextResponse.json({ error: 'Report unavailable or another execution is active' }, { status: 409 }) }
    after(() => runReport(id, owner).then(() => {}).catch(() => {}))

    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
