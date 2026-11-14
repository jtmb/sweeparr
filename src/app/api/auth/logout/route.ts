import { guardApi } from '@/lib/auth/guard'
import prisma from '@/lib/db/client'
import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const denied = await guardApi('system')
  if (denied) return denied
  // Logout revokes all administrator sessions, including copied cookies.
  await prisma.authConfig.updateMany({ data: { secretKey: randomBytes(32).toString('hex') } })
  const cookieStore = await cookies()
  cookieStore.delete('cd_session')
  return NextResponse.json({ ok: true })
}
