import axios from 'axios'
import type { RadarrMovie } from '@/types'

export class RadarrClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
  }

  private get headers() {
    return { 'X-Api-Key': this.apiKey }
  }

  private apiUrl(path: string) {
    return `${this.baseUrl}/api/v3${path}`
  }

  async getMovies(): Promise<RadarrMovie[]> {
    const res = await axios.get<RadarrMovie[]>(this.apiUrl('/movie'), {
      headers: this.headers,
      timeout: 15000,
    })
    return res.data
  }

  async getMovie(id: number): Promise<RadarrMovie> {
    const res = await axios.get<RadarrMovie>(this.apiUrl(`/movie/${id}`), {
      headers: this.headers,
      timeout: 10000,
    })
    return res.data
  }

  async deleteMovie(id: number, deleteFiles = true): Promise<void> {
    try {
      await axios.delete(this.apiUrl(`/movie/${id}`), {
        headers: this.headers,
        params: { deleteFiles },
        timeout: 0, // no timeout — deletion blocks until files are gone; duration depends on file size
      })
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data
        const msg =
          (typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: unknown }).message)
            : null) ??
          (typeof body === 'string' && body.length < 300 ? body : null) ??
          `Radarr responded with status ${err.response.status}`
        // Treat 404 or Radarr's internal "not found" DB error as missing
        const isNotFound =
          err.response.status === 404 ||
          (err.response.status >= 400 && msg.toLowerCase().includes('expected query to return'))
        if (isNotFound) {
          const notFound = new Error(msg)
          ;(notFound as Error & { notFoundInArr: true }).notFoundInArr = true
          throw notFound
        }
        throw new Error(msg)
      }
      throw err
    }
  }

  async testConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const res = await axios.get<{ version: string }>(this.apiUrl('/system/status'), {
        headers: this.headers,
        timeout: 8000,
      })
      return { ok: true, version: res.data.version }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  }
}

export function createRadarrClient(baseUrl: string, apiKey: string): RadarrClient {
  return new RadarrClient(baseUrl, apiKey)
}
