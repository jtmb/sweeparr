import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { compare } from 'bcryptjs'
import { randomBytes } from 'crypto'
import prisma from '@/lib/db/client'
import { createSession } from '@/lib/auth/session'

export async function POST(req: Request) {
  const { username, password } = (await req.json()) as { username?: string; password?: string }

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  // Upsert AuthConfig to ensure a row exists
  let auth = await prisma.authConfig.findFirst()
  if (!auth) {
    const secretKey = randomBytes(32).toString('hex')
    auth = await prisma.authConfig.create({ data: { secretKey } })
  }

  if (!auth.enabled) {
    return NextResponse.json({ error: 'Auth is not enabled' }, { status: 403 })
  }

  if (!auth.passwordHash) {
    return NextResponse.json({ error: 'No password configured' }, { status: 403 })
  }

  const configuredUsername = (auth.username || 'admin').trim().toLowerCase()
  if (username.trim().toLowerCase() !== configuredUsername) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const valid = await compare(password, auth.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const { token, expiresAt } = await createSession(auth.secretKey)

  const cookieStore = await cookies()
  cookieStore.set('cd_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })

  return NextResponse.json({ ok: true })
}
