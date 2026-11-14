import { cookies } from 'next/headers'
import prisma from '@/lib/db/client'
import { verifySession } from './session'

/** Route-local authorization: never trust a client demo marker or a page layout. */
export async function guardApi(capability: 'admin' | 'demo' | 'system' = 'admin'): Promise<Response | null> {
  const demo = await prisma.settings.findUnique({ where: { key: 'demoMode' } })
  if (demo?.value === 'true') {
    if (capability === 'demo') return null
    if (capability !== 'system') return Response.json({ error: 'Unavailable in demo mode' }, { status: 403 })
  }
  const auth = await prisma.authConfig.findFirst()
  // Open administration is an intentional deployment mode, including first setup.
  if (!auth?.enabled && demo?.value !== 'true') return null
  if (!auth?.enabled) return Response.json({ error: 'Administrator authentication required' }, { status: 403 })
  const token = (await cookies()).get('cd_session')?.value
  if (!token || !await verifySession(token, auth.secretKey)) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }
  return null
}
