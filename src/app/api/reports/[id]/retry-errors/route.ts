import { guardApi } from '@/lib/auth/guard'

export async function POST() {
  const denied = await guardApi('demo')
  if (denied) return denied
  return Response.json({ error: 'Reconcile external outcomes, then rescan and generate a new report. Automatic retries are disabled.' }, { status: 409 })
}
