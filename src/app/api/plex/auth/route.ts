import { NextResponse } from 'next/server'
import axios from 'axios'
import { getDemoContext } from '@/lib/demo'

const PLEX_TV = 'https://plex.tv/api/v2'
const CLIENT_ID = 'sweeparr'
const PLEX_HEADERS = {
  'X-Plex-Client-Identifier': CLIENT_ID,
  'X-Plex-Product': 'Sweeparr',
  'X-Plex-Version': '1.0.0',
  'Accept': 'application/json',
}

// POST /api/plex/auth — create a PIN and return the auth URL
export async function POST() {
  try {
    const { demoMode } = await getDemoContext()
    if (demoMode) {
      return NextResponse.json({ pinId: 'demo', code: 'demo', authUrl: '#' })
    }

    const res = await axios.post(
      `${PLEX_TV}/pins`,
      { strong: true },
      { headers: { ...PLEX_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
    const { id, code } = res.data
    const authUrl =
      `https://app.plex.tv/auth#?` +
      `clientID=${encodeURIComponent(CLIENT_ID)}` +
      `&code=${encodeURIComponent(code)}` +
      `&context[device][product]=${encodeURIComponent('Sweeparr')}`

    return NextResponse.json({ pinId: id, code, authUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

interface PlexConnection { uri: string; local: boolean; relay: boolean; address: string; port: number }
interface PlexResource { name: string; provides: string; connections: PlexConnection[] }

async function fetchServers(token: string): Promise<{ name: string; url: string; local: boolean }[]> {
  const res = await axios.get(`${PLEX_TV}/resources`, {
    headers: { ...PLEX_HEADERS, 'X-Plex-Token': token },
    params: { includeHttps: 1, includeRelay: 0, includeIPv6: 0 },
  })
  const servers: { name: string; url: string; local: boolean }[] = []
  for (const resource of res.data as PlexResource[]) {
    if (!resource.provides.includes('server')) continue
    // Prefer local connections first, then remote
    const sorted = [...resource.connections].sort((a, b) => (b.local ? 1 : 0) - (a.local ? 1 : 0))
    for (const conn of sorted) {
      servers.push({ name: resource.name, url: conn.uri, local: conn.local })
    }
  }
  return servers
}

/** Try each server URL in order; return the first one that responds to /identity */
async function probeServers(
  servers: { name: string; url: string; local: boolean }[],
  token: string,
): Promise<string | null> {
  for (const server of servers) {
    try {
      await axios.get(`${server.url}/identity`, {
        headers: { 'X-Plex-Token': token },
        timeout: 4000,
        validateStatus: (s) => s < 500,
      })
      return server.url
    } catch {
      // connection refused / timeout — try next
    }
  }
  return null
}

// GET /api/plex/auth?pinId=... — poll for the auth token; returns servers on success
export async function GET(req: Request) {
  const { demoMode } = await getDemoContext()
  if (demoMode) {
    return NextResponse.json({ authenticated: false })
  }

  const { searchParams } = new URL(req.url)
  const pinId = searchParams.get('pinId')
  if (!pinId) return NextResponse.json({ error: 'pinId required' }, { status: 400 })

  try {
    const res = await axios.get(`${PLEX_TV}/pins/${pinId}`, { headers: PLEX_HEADERS })
    const { authToken } = res.data
    if (authToken) {
      const servers = await fetchServers(authToken).catch(() => [])
      const bestUrl = await probeServers(servers, authToken)
      return NextResponse.json({ authenticated: true, token: authToken, servers, bestUrl })
    }
    return NextResponse.json({ authenticated: false })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
