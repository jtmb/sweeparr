import { NextRequest, NextResponse } from 'next/server'

/**
 * Middleware — handles demo mode session cookie assignment.
 *
 * When demo mode is active (cd_demo_mode=1 cookie set by the system API),
 * we assign a per-visitor cd_demo_session UUID cookie if one is not present.
 * Clearing browser data removes the cookie, producing a new UUID → fresh session.
 *
 * Auth is handled downstream in the app layout, not here.
 */
export function middleware(request: NextRequest) {
  const isDemoMode = request.cookies.get('cd_demo_mode')?.value === '1'

  if (!isDemoMode) return NextResponse.next()

  const hasSession = !!request.cookies.get('cd_demo_session')?.value
  if (hasSession) return NextResponse.next()

  // Assign a new demo session UUID (Web Crypto API — available in Edge Runtime)
  const sessionId = crypto.randomUUID()
  const response = NextResponse.next()
  response.cookies.set('cd_demo_session', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 4 * 60 * 60, // 4 hours
  })
  return response
}

export const config = {
  matcher: [
    // Apply to all routes except static assets and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
  ],
}
