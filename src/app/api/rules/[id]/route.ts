import { NextResponse } from 'next/server'
import prisma from '@/lib/db/client'
import { getDemoContext } from '@/lib/demo'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      return NextResponse.json({ error: 'Rules cannot be modified in demo mode' }, { status: 403 })
    }
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const rule = await prisma.cleanupRule.update({ where: { id }, data: body })
    return NextResponse.json(rule)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      return NextResponse.json({ error: 'Rules cannot be deleted in demo mode' }, { status: 403 })
    }
    const { id } = await params
    await prisma.cleanupRule.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
