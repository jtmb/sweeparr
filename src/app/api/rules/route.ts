import { NextResponse } from 'next/server'
import prisma from '@/lib/db/client'
import { getDemoContext, demoPrisma } from '@/lib/demo'

// Rules CRUD
export async function GET() {
  const { demoMode } = await getDemoContext()
  const db = demoMode ? demoPrisma : prisma
  const rules = await db.cleanupRule.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json(rules.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })))
}

export async function POST(req: Request) {
  try {
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      return NextResponse.json({ error: 'Rules cannot be created in demo mode' }, { status: 403 })
    }
    const body = (await req.json()) as {
      name: string
      libraryId?: string
      enabled: boolean
      minAgeDays: number
      maxDaysSinceWatched?: number
      protectNeverWatched: boolean
      protectInProgress: boolean
    }

    const rule = await prisma.cleanupRule.create({ data: body })
    return NextResponse.json(rule, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
