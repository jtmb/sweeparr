import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import prisma from '@/lib/db/client'
import { verifySession } from '@/lib/auth/session'
import { isDemoMode } from '@/lib/demo'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const demo = await isDemoMode()

  if (demo) {
    // In demo mode: auth is bypassed for all routes.
    // The system settings page handles its own access control client-side
    // (redirects non-admin demo visitors, allows authenticated admins through).
  } else {
    const auth = await prisma.authConfig.findFirst()
    if (auth?.enabled) {
      const cookieStore = await cookies()
      const token = cookieStore.get('cd_session')?.value
      const valid = token ? await verifySession(token, auth.secretKey) : false
      if (!valid) redirect('/login')
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 relative">{children}</main>
      </div>
    </div>
  )
}
