import { NextResponse, NextRequest } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'

// ─── In-memory image cache (survives HMR via globalThis) ─────────────────────
interface ImgEntry { buffer: ArrayBuffer; contentType: string; cachedAt: number }
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 h
const CACHE_MAX = 500

declare const globalThis: typeof global & { _imgCache?: Map<string, ImgEntry> }
if (!globalThis._imgCache) globalThis._imgCache = new Map()
const imgCache = globalThis._imgCache

function getCached(key: string): ImgEntry | null {
  const entry = imgCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL) { imgCache.delete(key); return null }
  return entry
}

function setCached(key: string, entry: ImgEntry) {
  if (imgCache.size >= CACHE_MAX) {
    // evict oldest entry
    imgCache.delete(imgCache.keys().next().value!)
  }
  imgCache.set(key, entry)
}

// Proxy poster images from Radarr/Sonarr to avoid exposing API keys to the browser
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  const url = req.nextUrl.searchParams.get('url')

  if (!url) return NextResponse.json({ error: 'url param required' }, { status: 400 })

  const cfg = await getConnectionConfig()

  let imageUrl: string
  let fetchHeaders: Record<string, string> = {}

  if (service === 'radarr') {
    const baseUrl = cfg.radarrUrl
    const apiKey = cfg.radarrApiKey
    if (!baseUrl || !apiKey) return NextResponse.json({ error: 'Radarr not configured' }, { status: 503 })
    imageUrl = url.startsWith('http') ? url : `${baseUrl}${url}`
    fetchHeaders = { 'X-Api-Key': apiKey }
  } else if (service === 'sonarr') {
    const baseUrl = cfg.sonarrUrl
    const apiKey = cfg.sonarrApiKey
    if (!baseUrl || !apiKey) return NextResponse.json({ error: 'Sonarr not configured' }, { status: 503 })
    imageUrl = url.startsWith('http') ? url : `${baseUrl}${url}`
    fetchHeaders = { 'X-Api-Key': apiKey }
  } else if (service === 'plex') {
    if (!cfg.plexUrl || !cfg.plexToken) {
      return NextResponse.json({ error: 'Plex not configured' }, { status: 503 })
    }
    imageUrl = url.startsWith('http') ? url : `${cfg.plexUrl}${url}`
    fetchHeaders = { 'X-Plex-Token': cfg.plexToken }
  } else {
    return NextResponse.json({ error: 'Unknown service' }, { status: 400 })
  }

  try {
    const cacheKey = `${service}:${imageUrl}`
    const cached = getCached(cacheKey)
    if (cached) {
      return new NextResponse(cached.buffer, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        },
      })
    }

    const response = await fetch(imageUrl, {
      headers: fetchHeaders,
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Image fetch failed' }, { status: response.status })
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const buffer = await response.arrayBuffer()

    setCached(cacheKey, { buffer, contentType, cachedAt: Date.now() })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
