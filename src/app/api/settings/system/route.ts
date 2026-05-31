import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSetting, setSetting } from '@/lib/db/queries'
import { isDemoMode, invalidateDemoModeCache, seedDemoData, clearDemoData } from '@/lib/demo'
import { verifySession } from '@/lib/auth/session'
import prisma from '@/lib/db/client'

export const dynamic = 'force-dynamic'

// GET /api/settings/system — returns current system settings + whether caller is an admin
export async function GET() {
  const demoMode = await isDemoMode()

  // Determine if the caller has a valid admin session
  let isAdmin = false
  const auth = await prisma.authConfig.findFirst()
  if (!auth?.enabled) {
    // Auth disabled — everyone is effectively admin
    isAdmin = true
  } else {
    const cookieStore = await cookies()
    const token = cookieStore.get('cd_session')?.value
    if (token) isAdmin = await verifySession(token, auth.secretKey)
  }

  return NextResponse.json({ demoMode, isAdmin })
}

// PUT /api/settings/system — toggle demo mode
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { demoMode?: boolean }

    if (typeof body.demoMode === 'boolean') {
      const cookieStore = await cookies()

      if (body.demoMode) {
        // Enable demo mode
        await setSetting('demoMode', 'true')
        invalidateDemoModeCache()
        await seedDemoData()

        const res = NextResponse.json({ ok: true })
        res.cookies.set('cd_demo_mode', '1', {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 365 * 24 * 60 * 60, // 1 year — survives server restarts
        })
        return res
      } else {
        // Disable demo mode
        await clearDemoData()
        await setSetting('demoMode', '')
        invalidateDemoModeCache()

        const existingSession = cookieStore.get('cd_demo_session')?.value
        const res = NextResponse.json({ ok: true })
        res.cookies.set('cd_demo_mode', '', { maxAge: 0, path: '/' })
        if (existingSession) {
          res.cookies.set('cd_demo_session', '', { maxAge: 0, path: '/' })
        }
        return res
      }
    }

    return NextResponse.json({ error: 'demoMode (boolean) required' }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
