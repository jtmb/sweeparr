import { NextResponse } from 'next/server'
import prisma from '@/lib/db/client'
import { generateReport } from '@/lib/cleanup/engine'
import { getDemoContext, demoGenerateReport, saveDemoSession } from '@/lib/demo'

export async function GET() {
  try {
    const { demoMode, sessionId, session } = await getDemoContext()

    if (demoMode) {
      if (!session) return NextResponse.json([])
      return NextResponse.json(
        session.reports.map((r) => ({
          id: r.id,
          generatedAt: r.generatedAt,
          status: r.status,
          totalItems: r.items.length,
          totalSizeBytes: r.items.reduce((s, i) => s + i.fileSizeBytes, 0),
          executedAt: r.executedAt ?? null,
          triggeredBy: r.triggeredBy,
          ruleNames: [...new Set(r.items.map((i) => i.ruleName).filter(Boolean) as string[])],
          removedItems: r.items.filter((i) => i.status === 'deleted').length,
          clearedBytes: r.items.filter((i) => i.status === 'deleted').reduce((s, i) => s + i.fileSizeBytes, 0),
          erroredItems: r.items.filter((i) => i.status === 'error').length,
        }))
      )
    }

    const reports = await prisma.cleanupReport.findMany({
      orderBy: { generatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        generatedAt: true,
        status: true,
        totalItems: true,
        totalSizeBytes: true,
        executedAt: true,
        triggeredBy: true,
        items: { select: { ruleName: true, status: true, fileSizeBytes: true } },
      },
    })
    return NextResponse.json(
      reports.map(({ items, ...r }) => ({
        ...r,
        totalSizeBytes: Number(r.totalSizeBytes),
        ruleNames: [...new Set(items.map((i) => i.ruleName).filter((n): n is string => !!n))],
        removedItems: items.filter((i) => i.status === 'deleted').length,
        clearedBytes: items
          .filter((i) => i.status === 'deleted')
          .reduce((sum, i) => sum + Number(i.fileSizeBytes), 0),
        erroredItems: items.filter((i) => i.status === 'error').length,
      }))
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { demoMode, sessionId, session } = await getDemoContext()

    if (demoMode) {
      if (!sessionId || !session) {
        return NextResponse.json({ error: 'No demo session' }, { status: 400 })
      }
      const reportId = await demoGenerateReport(sessionId, session)
      return NextResponse.json({ reportId }, { status: 201 })
    }

    let ruleIds: string[] | undefined
    try {
      const body = await req.json() as { ruleIds?: string[] }
      if (Array.isArray(body.ruleIds) && body.ruleIds.length > 0) ruleIds = body.ruleIds
    } catch { /* no body */ }
    const reportId = await generateReport('manual', ruleIds)
    return NextResponse.json({ reportId }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
