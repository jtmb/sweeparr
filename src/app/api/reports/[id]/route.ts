import { guardApi } from '@/lib/auth/guard'
import { NextResponse } from 'next/server'
import prisma from '@/lib/db/client'
import { getDemoContext, saveDemoSession } from '@/lib/demo'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardApi('demo')
  if (denied) return denied
  try {
    const { id } = await params
    const { demoMode, sessionId, session } = await getDemoContext()

    if (demoMode) {
      if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const report = session.reports.find((r) => r.id === id)
      if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({
        ...report,
        totalSizeBytes: report.items.reduce((s, i) => s + i.fileSizeBytes, 0),
        items: report.items.map((item) => ({
          ...item,
          reasons: item.reasons,
          addedAt: item.addedAt,
          lastWatchedAt: item.lastWatchedAt ?? null,
          createdAt: item.addedAt,
        })),
      })
    }

    const report = await prisma.cleanupReport.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { fileSizeBytes: 'desc' },
        },
      },
    })

    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      ...report,
      totalSizeBytes: Number(report.totalSizeBytes),
      items: report.items.map((item) => ({
        ...item,
        fileSizeBytes: Number(item.fileSizeBytes),
        reasons: JSON.parse(item.reasons) as string[],
        addedAt: item.addedAt.toISOString(),
        lastWatchedAt: item.lastWatchedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      generatedAt: report.generatedAt.toISOString(),
      executedAt: report.executedAt?.toISOString() ?? null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardApi('demo')
  if (denied) return denied
  try {
    const { id } = await params
    const { demoMode, sessionId, session } = await getDemoContext()

    if (demoMode) {
      if (sessionId && session) {
        session.reports = session.reports.filter((r) => r.id !== id)
        await saveDemoSession(sessionId, session)
      }
      return NextResponse.json({ ok: true })
    }

    const removed = await prisma.cleanupReport.deleteMany({ where: { id, status: { in: ['READY', 'COMPLETED'] }, items: { none: { status: { in: ['unknown', 'deleting'] } } } } })
    if (!removed.count) return NextResponse.json({ error: 'Report is active or unavailable' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
