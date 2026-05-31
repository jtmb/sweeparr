export async function register() {
  // Only run on the server side (Node.js runtime), not in Edge or browser
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('@/lib/scheduler')
    try {
      await initScheduler()
      console.log('[Instrumentation] Scheduler initialized')
    } catch (err) {
      console.error('[Instrumentation] Scheduler init failed:', err)
    }

    try {
      const { isDemoMode, seedDemoData } = await import('@/lib/demo')
      const { ensureDemoSchema } = await import('@/lib/demo/db')
      if (await isDemoMode()) {
        ensureDemoSchema()
        await seedDemoData()
        console.log('[Instrumentation] Demo data seeded')
      }
    } catch (err) {
      console.error('[Instrumentation] Demo seed failed:', err)
    }
  }
}
