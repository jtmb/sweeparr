import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { compare } from 'bcryptjs'
import prisma from '@/lib/db/client'
import { createSession } from '@/lib/auth/session'
import { takeBudget } from '@/lib/auth/rate-limit'
import { boundedJson } from '@/lib/security/json'

export async function POST(req: Request) {
  if (!await takeBudget('login', 5, 60_000)) {
    return NextResponse.json({ error: 'Too many login attempts' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  if (Number(req.headers.get('content-length')) > 4096) return new Response(null, { status: 413 })
  const { username, password } = (await boundedJson(req, 4096)) as { username?: string; password?: string }

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || username.length > 128 || password.length > 1024) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  const auth = await prisma.authConfig.findFirst()
  if (!auth?.enabled) {
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
