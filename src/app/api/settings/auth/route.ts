import { guardApi } from '@/lib/auth/guard'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { hash } from 'bcryptjs'
import prisma from '@/lib/db/client'
import { getDemoContext } from '@/lib/demo'

async function getOrCreateAuth() {
  return prisma.$transaction(async tx => {
    const existing = await tx.authConfig.findFirst()
    if (existing) return existing
    const secretKey = randomBytes(32).toString('hex')
    return tx.authConfig.create({ data: { secretKey } })
  })
}

export async function GET() {
  const denied = await guardApi('demo')
  if (denied) return denied
  const { demoMode } = await getDemoContext()
  if (demoMode) {
    // Return a safe fake — never expose real auth config to demo visitors
    return NextResponse.json({ enabled: false, username: '', hasUsername: false, hasPassword: false })
  }
  const auth = await getOrCreateAuth()
  return NextResponse.json({
    enabled: auth.enabled,
    username: auth.username || '',
    hasUsername: auth.username.trim() !== '',
    hasPassword: auth.passwordHash !== '',
  })
}

export async function PUT(req: Request) {
  const denied = await guardApi()
  if (denied) return denied
  const { demoMode } = await getDemoContext()
  if (demoMode) {
    return NextResponse.json({ error: 'Auth settings cannot be changed in demo mode' }, { status: 403 })
  }

  const body = (await req.json()) as { enabled?: boolean; username?: string; password?: string }
  const auth = await getOrCreateAuth()

  const updates: Record<string, unknown> = { secretKey: randomBytes(32).toString('hex') }

  if (typeof body.username === 'string') {
    const username = body.username.trim()
    if (!username) {
      return NextResponse.json({ error: 'Username cannot be empty' }, { status: 400 })
    }
    if (username.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })
    }
    updates.username = username
  }

  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    updates.passwordHash = await hash(body.password, 12)
  }

  const nextUsername = typeof updates.username === 'string' ? String(updates.username).trim() : auth.username.trim()
  const nextHasPassword = Boolean(updates.passwordHash ?? auth.passwordHash)

  if (typeof body.enabled === 'boolean') {
    // Disallow enabling if username/password are not set
    if (body.enabled && (!nextUsername || !nextHasPassword)) {
      return NextResponse.json({ error: 'Set a username and password before enabling auth' }, { status: 400 })
    }
    updates.enabled = body.enabled
  }

  await prisma.authConfig.update({ where: { id: auth.id }, data: updates })
  return NextResponse.json({ ok: true })
}
