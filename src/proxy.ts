import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/db/queries'
import { takeBudget } from '@/lib/auth/rate-limit'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/health') return NextResponse.next()
  if (await getSetting('demoMode') !== 'true') return NextResponse.next()
  if (!['GET', 'HEAD'].includes(request.method) && !await takeBudget('demo-mutations', 60, 60_000)) {
    return new NextResponse(null, { status: 429 })
  }
  const existing = request.cookies.get('cd_demo_session')?.value
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(existing)) return NextResponse.next()
  if (!await takeBudget('demo-allocation', 20, 60_000)) return new NextResponse(null, { status: 429 })
  const id = crypto.randomUUID()
  request.cookies.set('cd_demo_session', id)
  const response = NextResponse.next({ request: { headers: request.headers } })
  response.cookies.set('cd_demo_session', id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 4 * 60 * 60 })
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'] }
