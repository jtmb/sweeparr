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
        if (report) { report.status = 'PAUSED'; await saveDemoSession(sessionId, session) }
      }
      return NextResponse.json({ ok: true })
    }

    const report = await prisma.cleanupReport.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    if (report.status !== 'EXECUTING') {
      return NextResponse.json({ error: `Report is ${report.status}, not EXECUTING` }, { status: 409 })
    }
    await prisma.cleanupReport.update({
      where: { id },
      data: { pauseRequested: true },
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
