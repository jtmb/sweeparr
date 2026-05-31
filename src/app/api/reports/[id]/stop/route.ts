import { NextResponse } from 'next/server'
import prisma from '@/lib/db/client'
import { getDemoContext, saveDemoSession } from '@/lib/demo'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { demoMode, sessionId, session } = await getDemoContext()

    if (demoMode) {
      if (sessionId && session) {
        const report = session.reports.find((r) => r.id === id)
        if (report) { report.status = 'COMPLETED'; report.executedAt = new Date().toISOString(); await saveDemoSession(sessionId, session) }
      }
      return NextResponse.json({ ok: true })
    }

    const report = await prisma.cleanupReport.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    if (report.status !== 'EXECUTING' && report.status !== 'PAUSED') {
      return NextResponse.json({ error: `Report is ${report.status}, cannot stop` }, { status: 409 })
    }
    if (report.status === 'EXECUTING') {
      // Signal executor to stop after current item
      await prisma.cleanupReport.update({
        where: { id },
        data: { stopRequested: true },
      })
    } else {
      // Already paused — finalize immediately
      await prisma.cleanupReport.update({
        where: { id },
        data: { status: 'COMPLETED', executedAt: new Date(), pauseRequested: false, stopRequested: false },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
