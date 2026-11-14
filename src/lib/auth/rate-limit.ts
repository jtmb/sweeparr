import prisma from '@/lib/db/client'

/** A single-account installation uses a durable global budget; source headers
 * cannot split or bypass it. SQLite serializes the transaction across workers. */
export async function takeBudget(name: string, limit: number, windowMs: number): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const key = `security:budget:${name}`
    const row = await tx.settings.findUnique({ where: { key } })
    const now = Date.now()
    const old = row ? JSON.parse(row.value) as { until: number; count: number } : null
    const state = old && old.until > now ? old : { until: now + windowMs, count: 0 }
    if (state.count >= limit) return false
    state.count++
    await tx.settings.upsert({ where: { key }, create: { key, value: JSON.stringify(state) }, update: { value: JSON.stringify(state) } })
    return true
  })
}
