import { createHash } from 'crypto'
import type { ConnectionConfig, PlexMediaItem, PlexSession } from '@/types'

export function connectionFingerprint(cfg: ConnectionConfig): string {
  // Credentials are included only in a digest, never persisted as plaintext here.
  return createHash('sha256').update(JSON.stringify([cfg.plexUrl, cfg.radarrUrl, cfg.sonarrUrl, cfg.plexToken, cfg.radarrApiKey, cfg.sonarrApiKey])).digest('hex')
}

export function stableId(item: PlexMediaItem, provider: 'tmdb' | 'tvdb'): number | null {
  const ids = (item.Guid ?? []).map(g => g.id).filter(id => id.startsWith(`${provider}://`))
  if (ids.length !== 1 || !new RegExp(`^${provider}://[1-9][0-9]*$`).test(ids[0])) return null
  return Number(ids[0].split('://')[1])
}

export function playbackKeys(items: Array<PlexMediaItem | PlexSession>): Set<string> {
  const keys = new Set<string>()
  for (const item of items) {
    if (!item.ratingKey || (item.type === 'episode' && !item.grandparentRatingKey)) throw new Error('Playback identity unavailable')
    keys.add(item.ratingKey)
    if (item.grandparentRatingKey) keys.add(item.grandparentRatingKey)
    if (item.parentRatingKey) keys.add(item.parentRatingKey)
  }
  return keys
}
