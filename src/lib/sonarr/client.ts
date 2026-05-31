import axios from 'axios'
import type { SonarrSeries } from '@/types'

export interface SonarrEpisodeFile {
  id: number
  seriesId: number
  size: number
  dateAdded: string
}

export class SonarrClient {
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

  async getSeries(): Promise<SonarrSeries[]> {
    const res = await axios.get<SonarrSeries[]>(this.apiUrl('/series'), {
      headers: this.headers,
      timeout: 15000,
    })
    return res.data
  }

  async getSeriesById(id: number): Promise<SonarrSeries> {
    const res = await axios.get<SonarrSeries>(this.apiUrl(`/series/${id}`), {
      headers: this.headers,
      timeout: 10000,
    })
    return res.data
  }

  async getEpisodeFiles(seriesId: number): Promise<SonarrEpisodeFile[]> {
    const res = await axios.get<SonarrEpisodeFile[]>(this.apiUrl('/episodefile'), {
      headers: this.headers,
      params: { seriesId },
      timeout: 15000,
    })
    return res.data
  }

  async deleteSeries(id: number, deleteFiles = true): Promise<void> {
    try {
      await axios.delete(this.apiUrl(`/series/${id}`), {
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
          `Sonarr responded with status ${err.response.status}`
        // Treat 404 or Sonarr's internal "not found" DB error as missing
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
        timeout: 30000,
      })
      return { ok: true, version: res.data.version }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  }
}

export function createSonarrClient(baseUrl: string, apiKey: string): SonarrClient {
  return new SonarrClient(baseUrl, apiKey)
}
