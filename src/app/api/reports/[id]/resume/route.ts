import { NextResponse } from 'next/server'
import { executeReport } from '@/lib/cleanup/executor'
import prisma from '@/lib/db/client'
import { getDemoContext, saveDemoSession } from '@/lib/demo'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { demoMode, sessionId, session } = await getDemoContext()

    if (demoMode) {
      if (sessionId && session) {
        const report = session.reports.find((r) => r.id === id)
        if (report) {
          report.status = 'EXECUTING'
          report.items.forEach((item) => { if (item.status === 'pending') item.status = 'deleted' })
          report.executedAt = new Date().toISOString()
          await saveDemoSession(sessionId, session)
        }
      }
      return NextResponse.json({ ok: true }, { status: 202 })
    }

    let body: { allowPlexDeletion?: boolean } = {}
    try { body = await req.json() } catch { /* no body is fine */ }
    const allowPlexDeletion = body.allowPlexDeletion === true

    const report = await prisma.cleanupReport.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    if (report.status !== 'PAUSED') {
      return NextResponse.json({ error: `Report is ${report.status}, not PAUSED` }, { status: 409 })
    }

    await prisma.cleanupReport.update({
      where: { id },
      data: { status: 'READY', pauseRequested: false },
    })

    executeReport(id, { allowPlexDeletion }).catch((err: unknown) =>
      console.error(`[resume] Report ${id} failed:`, err)
    )

    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
