import { NextResponse } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'
import { createRadarrClient } from '@/lib/radarr/client'
import { createSonarrClient } from '@/lib/sonarr/client'
import { sendTestNotification } from '@/lib/notifications'
import { getDemoContext } from '@/lib/demo'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ service: string }> }
) {
  try {
    const { service } = await params
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      return NextResponse.json({ ok: true, version: '1.0-demo', name: 'Demo Server' })
    }

    const body = (await req.json()) as Record<string, unknown>
    const pickString = (v: unknown) => (typeof v === 'string' ? v : '')
    const stored = await getConnectionConfig()

    if (service === 'plex') {
      const url = pickString(body.plexUrl) || stored.plexUrl
      const token = pickString(body.plexToken) || stored.plexToken
      if (!url || !token) return NextResponse.json({ ok: false, error: 'URL and token required' })
      try {
        const plex = createPlexClient(url, token)
        const info = await plex.getServerInfo()
        return NextResponse.json({ ok: true, version: info.version, name: info.friendlyName })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ ok: false, error: msg })
      }
    }

    if (service === 'radarr') {
      const url = pickString(body.radarrUrl) || stored.radarrUrl
      const key = pickString(body.radarrApiKey) || stored.radarrApiKey
      if (!url || !key) return NextResponse.json({ ok: false, error: 'URL and API key required' })
      const result = await createRadarrClient(url, key).testConnection()
      return NextResponse.json(result)
    }

    if (service === 'sonarr') {
      const url = pickString(body.sonarrUrl) || stored.sonarrUrl
      const key = pickString(body.sonarrApiKey) || stored.sonarrApiKey
      if (!url || !key) return NextResponse.json({ ok: false, error: 'URL and API key required' })
      const result = await createSonarrClient(url, key).testConnection()
      return NextResponse.json(result)
    }

    if (service === 'discord' || service === 'smtp' || service === 'apprise') {
      const cfg = body
      if (service === 'discord' && !cfg.webhookUrl)
        return NextResponse.json({ ok: false, error: 'Webhook URL is required' })
      if (service === 'smtp') {
        if (!cfg.host) return NextResponse.json({ ok: false, error: 'SMTP host is required' })
        const to = Array.isArray(cfg.to) ? cfg.to : cfg.to ? [cfg.to] : []
        if (to.length === 0) return NextResponse.json({ ok: false, error: 'At least one recipient is required' })
      }
      if (service === 'apprise' && !cfg.url)
        return NextResponse.json({ ok: false, error: 'Apprise URL is required' })
      const withHtml = cfg.withHtml === true
      await sendTestNotification(service, cfg, withHtml)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'Unknown service' }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
