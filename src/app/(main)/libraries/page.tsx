'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Library, Film, Tv, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatRelativeDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface LibraryEntry {
  key: string
  title: string
  type: string
  totalSize: number
  itemCount: number
}

export default function LibrariesPage() {
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [cachedAt, setCachedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/plex/libraries')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setLibraries(data.libraries ?? [])
      setCachedAt(data.cachedAt ? new Date(data.cachedAt) : null)
      setScanning(data.scanning ?? false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // On mount: check status endpoint to resume polling if a scan is already in progress
  useEffect(() => {
    let cancelled = false
    fetch('/api/plex/libraries/scan')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.scanning) setScanning(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const triggerRescan = async () => {
    setScanning(true)
    await fetch('/api/plex/libraries/scan', { method: 'POST' })
  }

  // Poll when scanning
  useEffect(() => {
    if (!scanning) { stopPolling(); return }
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/plex/libraries/scan')
        const data = await res.json()
        if (!data.scanning) {
          stopPolling()
          await load()
        }
      } catch { /* ignore */ }
    }, 3000)
    return stopPolling
  }, [scanning, load])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Libraries</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-sm">Browse your Plex media libraries</p>
            {scanning ? (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating…
              </span>
            ) : cachedAt ? (
              <span className="text-xs text-muted-foreground">· Updated {formatRelativeDate(cachedAt)}</span>
            ) : null}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={triggerRescan} disabled={scanning}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1', scanning && 'animate-spin')} />
          {scanning ? 'Scanning…' : 'Rescan'}
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading…</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Library className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{error}</p>
          </CardContent>
        </Card>
      ) : scanning && libraries.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin" />
            <p className="text-sm font-medium">Scanning libraries for the first time…</p>
            <p className="text-xs">This may take a minute. The page will update automatically.</p>
          </CardContent>
        </Card>
      ) : libraries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Library className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No libraries found. Check your Plex connection in Settings.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {libraries.map((lib) => (
            <Link key={lib.key} href={`/libraries/${lib.key}`}>
              <Card className="hover:border-primary/50 hover:bg-accent/30 transition-all cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {lib.type === 'movie' ? (
                        <Film className="h-5 w-5 text-primary" />
                      ) : (
                        <Tv className="h-5 w-5 text-primary" />
                      )}
                      <CardTitle className="text-base group-hover:text-primary transition-colors">
                        {lib.title}
                      </CardTitle>
                    </div>
                    <Badge variant="secondary" className="capitalize text-xs">
                      {lib.type === 'show' ? 'TV Shows' : 'Movies'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{lib.itemCount} items</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
