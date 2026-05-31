import axios from 'axios'
import type { PlexLibrary, PlexMediaItem, PlexWatchEvent, PlexSession } from '@/types'

interface PlexResponse<T> {
  MediaContainer: T
}

export class PlexClient {
  private baseUrl: string
  private token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.token = token
  }

  private get headers() {
    return {
      'X-Plex-Token': this.token,
      Accept: 'application/json',
      'X-Plex-Client-Identifier': 'sweeparr',
      'X-Plex-Product': 'Sweeparr',
    }
  }

  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const response = await axios.get<PlexResponse<T>>(`${this.baseUrl}${path}`, {
      headers: this.headers,
      params: { ...params },
      timeout: 15000,
    })
    return response.data.MediaContainer
  }

  async getServerInfo(): Promise<{ friendlyName: string; version: string }> {
    const data = await this.get<{ friendlyName: string; version: string }>('/')
    return data
  }

  async getSections(): Promise<PlexLibrary[]> {
    const data = await this.get<{ Directory?: PlexLibrary[] }>('/library/sections')
    return data.Directory ?? []
  }

  /** Fetch only the total item count for a section without loading any media */
  async getSectionCount(sectionKey: string): Promise<number> {
    const data = await this.get<{ totalSize?: number; size?: number }>(
      `/library/sections/${sectionKey}/all`,
      { 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': 0 }
    )
    return data.totalSize ?? data.size ?? 0
  }

  async getSectionMedia(sectionId: string): Promise<PlexMediaItem[]> {
    const data = await this.get<{ Metadata?: PlexMediaItem[] }>(
      `/library/sections/${sectionId}/all`
    )
    return data.Metadata ?? []
  }

  async getWatchHistory(
    ratingKey: string,
    accountId?: number
  ): Promise<PlexWatchEvent[]> {
    const params: Record<string, string | number> = { sort: 'viewedAt:desc', 'X-Plex-Container-Size': 100 }
    if (accountId) params['accountID'] = accountId
    const data = await this.get<{ Metadata?: PlexWatchEvent[] }>(
      `/library/metadata/${ratingKey}/history`,
      params
    )
    return data.Metadata ?? []
  }

  /**
   * Fetch ALL play history across every user (admin token required).
   * Returns a map of ratingKey → { watchCount, lastWatchedAt }
   * so the engine can determine watch status without N per-item calls.
   */
  async getAllUsersHistory(): Promise<Map<string, {
    watchCount: number
    lastWatchedAt: number
    byUser: Map<number, { watchCount: number; lastWatchedAt: number }>
  }>> {
    const data = await this.get<{ Metadata?: PlexWatchEvent[] }>(
      '/status/sessions/history/all',
      { sort: 'viewedAt:desc', 'X-Plex-Container-Size': 10000 }
    )
    type Entry = { watchCount: number; lastWatchedAt: number; byUser: Map<number, { watchCount: number; lastWatchedAt: number }> }
    const map = new Map<string, Entry>()
    const bump = (key: string, accountID: number, viewedAt: number) => {
      let entry = map.get(key)
      if (!entry) { entry = { watchCount: 0, lastWatchedAt: 0, byUser: new Map() }; map.set(key, entry) }
      entry.watchCount += 1
      if (viewedAt > entry.lastWatchedAt) entry.lastWatchedAt = viewedAt
      const u = entry.byUser.get(accountID)
      if (u) { u.watchCount += 1; if (viewedAt > u.lastWatchedAt) u.lastWatchedAt = viewedAt }
      else entry.byUser.set(accountID, { watchCount: 1, lastWatchedAt: viewedAt })
    }
    const extractId = (path?: string) => path?.split('/').at(-1)
    for (const event of data.Metadata ?? []) {
      bump(event.ratingKey, event.accountID, event.viewedAt)
      const grandparentId = extractId(event.grandparentKey)
      const parentId = extractId(event.parentKey)
      if (grandparentId) bump(grandparentId, event.accountID, event.viewedAt)
      if (parentId) bump(parentId, event.accountID, event.viewedAt)
    }
    return map
  }

  async getCurrentSessions(): Promise<PlexSession[]> {
    const data = await this.get<{ Metadata?: PlexSession[] }>('/status/sessions')
    return data.Metadata ?? []
  }

  async getOnDeck(): Promise<PlexMediaItem[]> {
    const data = await this.get<{ Metadata?: PlexMediaItem[] }>('/library/onDeck')
    return data.Metadata ?? []
  }

  async getAllAccounts(): Promise<Array<{ id: number; name: string; thumb?: string }>> {
    try {
      const data = await this.get<{ Account?: Array<{ id: number; name: string; thumb?: string }> }>(
        '/accounts'
      )
      return data.Account ?? []
    } catch {
      return []
    }
  }

  /**
   * Trigger a Plex library section file scan (tells Plex to detect new/removed files).
   * Returns true if Plex accepted the request, false on any error.
   */
  async refreshSection(sectionKey: string): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/library/sections/${sectionKey}/refresh`, {
        headers: this.headers,
        timeout: 10000,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Delete an item directly from Plex library metadata by rating key.
   * Returns true if Plex accepted the delete request.
   */
  async deleteMetadata(ratingKey: string): Promise<void> {
    try {
      await axios.delete(`${this.baseUrl}/library/metadata/${ratingKey}`, {
        headers: this.headers,
        timeout: 0, // no timeout — Plex blocks while deleting files from disk
      })
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        // 404 = item already gone from Plex — treat as success
        if (err.response.status === 404) return
        const body = err.response.data
        const msg =
          (typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: unknown }).message)
            : null) ??
          (typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : null) ??
          (typeof body === 'string' && body.length < 300 ? body : null) ??
          `Plex responded with status ${err.response.status}`
        throw new Error(msg)
      }
      throw err
    }
  }
  /**
   * Terminate an active session. Sends a message to the client then kills the stream.
   * @param sessionId  The session's `Session.id` value from the sessions list
   */
  async terminateSession(sessionId: string, reason = 'Stream terminated by server'): Promise<void> {
    await axios.get(`${this.baseUrl}/status/sessions/terminate`, {
      headers: this.headers,
      params: { sessionId, reason },
      timeout: 10000,
    })
  }

  /**
   * Fetch detailed metadata for a single item by its rating key.
   * Returns null if the item is not found or Plex is unreachable.
   */
  async getItemDetail(ratingKey: string): Promise<import('@/app/api/plex/item/[ratingKey]/route').PlexItemDetail | null> {
    try {
      const data = await this.get<{ Metadata?: import('@/app/api/plex/item/[ratingKey]/route').PlexItemDetail[] }>(
        `/library/metadata/${ratingKey}`
      )
      return data.Metadata?.[0] ?? null
    } catch {
      return null
    }
  }
}

export function createPlexClient(baseUrl: string, token: string): PlexClient {
  return new PlexClient(baseUrl, token)
}
