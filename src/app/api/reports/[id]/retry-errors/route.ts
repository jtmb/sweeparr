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
          const count = report.items.filter((i) => i.status === 'error').length
          if (count === 0) return NextResponse.json({ error: 'No errored items to retry' }, { status: 400 })
          report.items.forEach((item) => { if (item.status === 'error') item.status = 'pending' })
          report.status = 'READY'
          await saveDemoSession(sessionId, session)
          return NextResponse.json({ ok: true, retryCount: count }, { status: 202 })
        }
      }
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    let body: { allowPlexDeletion?: boolean } = {}
    try { body = await req.json() } catch { /* no body is fine */ }
    const allowPlexDeletion = body.allowPlexDeletion === true

    const report = await prisma.cleanupReport.findUnique({
      where: { id },
      select: { status: true },
    })

    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    if (report.status !== 'COMPLETED') {
      return NextResponse.json({ error: `Report is ${report.status}, not COMPLETED` }, { status: 409 })
    }

    // Reset errored items back to pending so the executor will pick them up
    const { count } = await prisma.cleanupReportItem.updateMany({
      where: { reportId: id, status: 'error' },
      data: { status: 'pending', errorMessage: null },
    })

    if (count === 0) {
      return NextResponse.json({ error: 'No errored items to retry' }, { status: 400 })
    }

    // Reset report status so executor accepts it
    await prisma.cleanupReport.update({
      where: { id },
      data: { status: 'READY' },
    })

    // Fire-and-forget execution
    executeReport(id, { allowPlexDeletion }).catch((err: unknown) =>
      console.error(`[retry-errors] Report ${id} failed:`, err)
    )

    return NextResponse.json({ ok: true, retryCount: count }, { status: 202 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
