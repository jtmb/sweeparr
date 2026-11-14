import { NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { getConnectionConfig } from '@/lib/db/queries'
import { imageUrl } from '@/lib/security/service-url'
import { takeBudget } from '@/lib/auth/rate-limit'
import sharp from 'sharp'

const MAX_BYTES = 5 * 1024 * 1024
let active = 0

export async function GET(req: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  const denied = await guardApi()
  if (denied) return denied
  if (active >= 2) return new Response(null, { status: 429 })
  if (!await takeBudget('images', 120, 60_000)) return new Response(null, { status: 429 })
  // Recheck after the asynchronous shared admission decision.
  if (active >= 2) return new Response(null, { status: 429 })
  active++
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 10_000)
  try {
    const { service } = await params
    const cfg = await getConnectionConfig()
    const config = {
      plex: [cfg.plexUrl, cfg.plexToken, 'X-Plex-Token'],
      radarr: [cfg.radarrUrl, cfg.radarrApiKey, 'X-Api-Key'],
      sonarr: [cfg.sonarrUrl, cfg.sonarrApiKey, 'X-Api-Key'],
    }[service]
    if (!config) return new Response(null, { status: 400 })
    const [base, secret, header] = config
    if (!base || !secret) return new Response(null, { status: 503 })
    let url: URL
    try { url = imageUrl(base, req.nextUrl.searchParams.get('url') ?? '') }
    catch { return new Response(null, { status: 400 }) }
    const upstream = await fetch(url, {
      headers: { [header]: secret }, redirect: 'error', signal: controller.signal, cache: 'no-store',
    })
    if (!upstream.ok || !upstream.body) throw new Error('Image unavailable')
    if (Number(upstream.headers.get('content-length')) > MAX_BYTES) throw new Error('Image too large')
    const reader = upstream.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Image too large') }
      chunks.push(value)
    }
    const input = Buffer.concat(chunks)
    const decoder = sharp(input, { limitInputPixels: 16_000_000, animated: false }).timeout({ seconds: 3 })
    const meta = await decoder.metadata()
    if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '')) throw new Error('Unsupported image')
    const output = await decoder.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp().toBuffer()
    return new Response(new Uint8Array(output), { headers: {
      'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox",
    } })
  } catch {
    return Response.json({ error: 'Image unavailable or invalid' }, { status: 502 })
  } finally {
    controller.abort()
    clearTimeout(deadline)
    active--
  }
}
