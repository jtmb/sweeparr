import { getRecentLogs, subscribeToLogs } from '@/lib/logger'
import { isDemoMode } from '@/lib/demo'

export const dynamic = 'force-dynamic'

// GET /api/logs/stream — Server-Sent Events stream of log entries
export async function GET() {
  if (await isDemoMode()) {
    // Return an empty SSE stream — demo visitors must not see real server logs
    return new Response('', { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
  }
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Flush buffered logs to the new subscriber
      const recent = getRecentLogs()
      for (const entry of recent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`))
      }

      // Subscribe to future log entries
      unsubscribe = subscribeToLogs((entry) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`))
        } catch {
          // Client disconnected — clean up
          unsubscribe?.()
          unsubscribe = null
        }
      })
    },
    cancel() {
      unsubscribe?.()
      unsubscribe = null
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
