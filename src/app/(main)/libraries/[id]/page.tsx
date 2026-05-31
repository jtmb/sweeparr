'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import type { EnrichedMediaItem, WatchStatus } from '@/types'
import { formatBytes, formatRelativeDate, formatDate } from '@/lib/utils'
import PosterImage from '@/components/media/PosterImage'
import WatchBadge from '@/components/media/WatchBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import MediaDetailPanel from '@/components/media/MediaDetailPanel'
import type { MediaDetailItem } from '@/components/media/MediaDetailPanel'
import { LayoutGrid, List, Search, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, User, X, Trash2, ShieldOff, ShieldBan, CheckSquare, Square, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

type SortKey = 'title' | 'addedAt' | 'lastWatchedAt' | 'fileSizeBytes' | 'watchCount' | 'watchStatus' | 'poster'

export default function LibraryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [media, setMedia] = useState<EnrichedMediaItem[]>([])
  const [section, setSection] = useState<{ title: string; type: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scannedAt, setScannedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('addedAt')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollListenerCleanup = useRef<(() => void) | null>(null)

  // Grid size: S=13, M=9, L=6
  const [gridSize, setGridSize] = useState<'S' | 'M' | 'L'>('S')
  const gridCols = gridSize === 'S' ? 'grid-cols-[repeat(13,minmax(0,1fr))]' : gridSize === 'M' ? 'grid-cols-6 sm:grid-cols-7 md:grid-cols-9' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'
  const gridSizes = gridSize === 'S' ? '8vw' : gridSize === 'M' ? '16vw' : '25vw'

  // Selection state
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionBusy, setActionBusy] = useState<'delete' | 'exclude' | null>(null)
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Detail panel
  const [detailItem, setDetailItem] = useState<MediaDetailItem | null>(null)

  // Permanent exclusion keys — for shield overlay on grid cards
  const [exclusionKeys, setExclusionKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch('/api/exclusions')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setExclusionKeys(new Set(data.map((e: { plexRatingKey: string }) => e.plexRatingKey)))
        }
      })
      .catch(() => {})
  }, [])

  // Letter strip: tracks currently visible section (grid only)
  const [currentLetter, setCurrentLetter] = useState<string>('')

  // Filter panel
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const [filterStatus, setFilterStatus] = useState<WatchStatus[]>([])
  const [filterMediaType, setFilterMediaType] = useState<'all' | 'movie' | 'show'>('all')
  const [filterMinYear, setFilterMinYear] = useState('')
  const [filterMaxYear, setFilterMaxYear] = useState('')
  const [filterMinSize, setFilterMinSize] = useState('')
  const [filterMaxSize, setFilterMaxSize] = useState('')
  const [filterMinWatches, setFilterMinWatches] = useState('')
  const [filterMaxWatches, setFilterMaxWatches] = useState('')
  const [filterExclusion, setFilterExclusion] = useState<'all' | 'excluded' | 'not-excluded'>('all')

  // List pagination
  const LIST_PAGE_SIZE = 50
  const [listPage, setListPage] = useState(1)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/plex/library/${id}`)
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setSection(data.section)
      setMedia(data.media ?? [])
      setScannedAt(data.scannedAt ? new Date(data.scannedAt) : null)
      setScanning(data.scanning ?? false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  // On mount: also poll the status endpoint directly in case a scan started
  // before this page was opened (e.g. user navigated away mid-scan)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/plex/library/${id}/scan`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.scanning) setScanning(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])

  // Poll scan status when a scan is in progress
  useEffect(() => {
    if (!scanning) { stopPolling(); return }
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/plex/library/${id}/scan`)
        const data = await res.json()
        if (!data.scanning) {
          stopPolling()
          // Reload full data now that scan is done
          await load()
        }
      } catch { /* ignore poll errors */ }
    }, 3000)
    return stopPolling
  }, [scanning, id, load])

  useEffect(() => { load() }, [load])

  const triggerRescan = async () => {
    setScanning(true)
    await fetch(`/api/plex/library/${id}/scan`, { method: 'POST' })
  }

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === filtered.length && filtered.every((i) => selected.has(i.plexRatingKey))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((i) => i.plexRatingKey)))
    }
  }

  const selectedItems = media.filter((m) => selected.has(m.plexRatingKey))

  const handleDelete = async () => {
    setConfirmDelete(false)
    setActionBusy('delete')
    setActionResult(null)
    try {
      const res = await fetch(`/api/plex/library/${id}/items/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingKeys: [...selected] }),
      })
      const data = await res.json() as { deleted: number; failed: number }
      setMedia((prev) => prev.filter((m) => !selected.has(m.plexRatingKey)))
      setSelected(new Set())
      setActionResult({
        ok: data.failed === 0,
        message: data.failed === 0
          ? `Deleted ${data.deleted} item${data.deleted !== 1 ? 's' : ''} from Plex.`
          : `Deleted ${data.deleted}, failed ${data.failed}.`,
      })
    } catch (e: unknown) {
      setActionResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setActionBusy(null)
    }
  }

  const handleExclude = async () => {
    setActionBusy('exclude')
    setActionResult(null)
    try {
      const items = selectedItems.map((m) => ({
        plexRatingKey: m.plexRatingKey,
        title: m.title,
        year: m.year ?? null,
        mediaType: m.mediaType,
        posterPath: m.posterUrl ?? null,
      }))
      await fetch('/api/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      setSelected(new Set())
      setActionResult({ ok: true, message: `Added ${items.length} item${items.length !== 1 ? 's' : ''} to permanent exclusions.` })
    } catch (e: unknown) {
      setActionResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setActionBusy(null)
    }
  }

  const filtered = media
    .filter((m) => {
      if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterStatus.length > 0 && !filterStatus.includes(m.watchStatus)) return false
      if (filterMediaType !== 'all' && m.mediaType !== filterMediaType) return false
      if (filterMinYear !== '' && (m.year == null || m.year < Number(filterMinYear))) return false
      if (filterMaxYear !== '' && (m.year == null || m.year > Number(filterMaxYear))) return false
      if (filterMinSize !== '' && m.fileSizeBytes < Number(filterMinSize) * 1e9) return false
      if (filterMaxSize !== '' && m.fileSizeBytes > Number(filterMaxSize) * 1e9) return false
      if (filterMinWatches !== '' && m.watchCount < Number(filterMinWatches)) return false
      if (filterMaxWatches !== '' && m.watchCount > Number(filterMaxWatches)) return false
      if (filterExclusion === 'excluded' && !exclusionKeys.has(m.plexRatingKey)) return false
      if (filterExclusion === 'not-excluded' && exclusionKeys.has(m.plexRatingKey)) return false
      return true
    })
    .sort((a, b) => {
      // watchStatus: ordered by severity (now_playing → in_progress → watched → unwatched)
      if (sortKey === 'poster') {
        // 1 = has any poster (CDN, Plex thumb, or proxied), 0 = truly missing
        const va = a.posterUrl ? 1 : 0
        const vb = b.posterUrl ? 1 : 0
        return sortAsc ? va - vb : vb - va
      }
      if (sortKey === 'watchStatus') {
        const ORDER: Record<string, number> = { now_playing: 0, in_progress: 1, watched: 2, unwatched: 3 }
        const va = ORDER[a.watchStatus] ?? 99
        const vb = ORDER[b.watchStatus] ?? 99
        return sortAsc ? va - vb : vb - va
      }
      if (sortKey === 'title') {
        const va = a.title.toLowerCase()
        const vb = b.title.toLowerCase()
        return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
      }
      // Numeric / date fields — push nulls to end regardless of direction
      const rawA = a[sortKey as keyof typeof a]
      const rawB = b[sortKey as keyof typeof b]
      const va = rawA == null ? null : typeof rawA === 'string' ? new Date(rawA).getTime() : Number(rawA)
      const vb = rawB == null ? null : typeof rawB === 'string' ? new Date(rawB).getTime() : Number(rawB)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return sortAsc ? va - vb : vb - va
    })

  const LETTERS = ['#', 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

  const filterActiveCount = [
    filterStatus.length > 0,
    filterMediaType !== 'all',
    filterMinYear !== '',
    filterMaxYear !== '',
    filterMinSize !== '',
    filterMaxSize !== '',
    filterMinWatches !== '',
    filterMaxWatches !== '',
    filterExclusion !== 'all',
  ].filter(Boolean).length

  const clearFilters = () => {
    setFilterStatus([])
    setFilterMediaType('all')
    setFilterMinYear('')
    setFilterMaxYear('')
    setFilterMinSize('')
    setFilterMaxSize('')
    setFilterMinWatches('')
    setFilterMaxWatches('')
    setFilterExclusion('all')
  }

  const getItemLetter = (title: string) => {
    // Strip leading "The ", "A ", "An " for grouping (same as Radarr)
    const clean = title.replace(/^(the |a |an )/i, '').trim()
    const first = clean[0]?.toUpperCase() ?? ''
    return /[A-Z]/.test(first) ? first : '#'
  }

  const letterCounts = filtered.reduce<Record<string, number>>((acc, m) => {
    const l = getItemLetter(m.title)
    acc[l] = (acc[l] ?? 0) + 1
    return acc
  }, {})

  const letterGroups = LETTERS
    .map((l) => ({ letter: l, items: filtered.filter((m) => getItemLetter(m.title) === l) }))
    .filter((g) => g.items.length > 0)

  // List view sizing derived from gridSize
  const listPosterW = gridSize === 'S' ? 36 : gridSize === 'L' ? 60 : 44
  const listPosterH = gridSize === 'S' ? 52 : gridSize === 'L' ? 86 : 64
  const listPy = gridSize === 'S' ? 'py-1.5' : gridSize === 'L' ? 'py-5' : 'py-3'
  const listCols = gridSize === 'S'
    ? 'grid-cols-[28px_48px_1fr_120px_130px_100px_90px_90px_36px]'
    : gridSize === 'L'
      ? 'grid-cols-[28px_76px_1fr_120px_130px_100px_90px_90px_36px]'
      : 'grid-cols-[28px_60px_1fr_120px_130px_100px_90px_90px_36px]'

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
    setListPage(1)
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={cn(
        'text-xs font-medium px-2 py-1 rounded hover:bg-accent transition-colors',
        sortKey === k ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </button>
  )

  // Scroll fade state
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)
  const updateFade = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setFadeTop(el.scrollTop > 8)
    setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 8)
  }, [])
  // Callback ref: attaches/detaches the scroll listener exactly when the container mounts/unmounts
  // (avoids the loading-dependent useEffect that caused hook deps size mismatch)
  const scrollCallbackRef = useCallback((el: HTMLDivElement | null) => {
    scrollListenerCleanup.current?.()
    scrollListenerCleanup.current = null
    scrollRef.current = el
    if (!el) return
    const handler = () => {
      setFadeTop(el.scrollTop > 8)
      setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 8)
    }
    handler()
    el.addEventListener('scroll', handler, { passive: true })
    scrollListenerCleanup.current = () => el.removeEventListener('scroll', handler)
  }, [])
  // Re-check fades when filtered content changes (scrollHeight changes after data loads)
  useEffect(() => { updateFade() }, [filtered.length, updateFade])

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilterPanel) return
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterPanel])

  // Highlight letter strip as user scrolls (grid only)
  useEffect(() => {
    if (viewMode !== 'grid') return
    const sections = document.querySelectorAll<HTMLElement>('[data-letter-section]')
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setCurrentLetter(visible[0].target.getAttribute('data-letter-section') ?? '')
        }
      },
      { threshold: 0, rootMargin: '-10% 0px -80% 0px', root: scrollRef.current }
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [filtered.length, viewMode])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
      </div>
    )
  }

  const candidates = filtered.filter((m) => {
    // Show as candidate if not protected
    return !m.isCurrentlyPlaying && m.watchStatus !== 'now_playing'
  })

  return (
    <div data-fullheight className="absolute inset-0 flex flex-col overflow-hidden">
      <MediaDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
      {/* Sticky top: header, bars, filters — all outside the scroll area */}
      <div className="px-6 pt-6 pb-4 space-y-4 shrink-0">
      {/* Confirm delete dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete {selected.size} item{selected.size !== 1 ? 's' : ''} from Plex?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete {selected.size} item{selected.size !== 1 ? 's' : ''} from Plex.
            </DialogDescription>
            <div className="space-y-3 pt-1">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive font-medium">
                ⚠️ This action is <strong>irreversible</strong>. The selected items and their media files will be permanently deleted from Plex.
              </div>
              <p className="text-sm text-muted-foreground">
                Items to delete ({selected.size}):
              </p>
              <ul className="max-h-40 overflow-y-auto space-y-1 text-sm text-muted-foreground">
                {selectedItems.slice(0, 20).map((m) => (
                  <li key={m.plexRatingKey} className="truncate">· {m.title}{m.year ? ` (${m.year})` : ''} — {formatBytes(m.fileSizeBytes)}</li>
                ))}
                {selected.size > 20 && <li className="text-xs italic">…and {selected.size - 20} more</li>}
              </ul>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Yes, delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{section?.title ?? 'Library'}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-muted-foreground text-sm">
              {filtered.length} of {media.length} items
            </p>
            {scanning ? (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Scanning…
              </span>
            ) : scannedAt ? (
              <span className="text-xs text-muted-foreground">
                · Updated {formatRelativeDate(scannedAt)}
              </span>
            ) : null}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={triggerRescan} disabled={scanning}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1', scanning && 'animate-spin')} />
          {scanning ? 'Scanning…' : 'Rescan'}
        </Button>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={actionBusy === 'exclude'}
              onClick={handleExclude}
            >
              {actionBusy === 'exclude'
                ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <ShieldOff className="h-3.5 w-3.5 mr-1.5" />}
              Exclude from cleanup
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={actionBusy === 'delete'}
              onClick={() => setConfirmDelete(true)}
            >
              {actionBusy === 'delete'
                ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              Delete from Plex
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setSelected(new Set())}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Action result feedback */}
      {actionResult && (
        <div className={cn(
          'flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm',
          actionResult.ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
        )}>
          {actionResult.message}
          <button onClick={() => setActionResult(null)} className="ml-4 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* First-time scan placeholder */}
      {scanning && media.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-10 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Scanning library for the first time…</p>
          <p className="text-xs text-muted-foreground mt-1">This may take a minute. The page will update automatically.</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setListPage(1) }}
            className="pl-8 h-8"
          />
        </div>

        {(search !== '' || sortKey !== 'addedAt' || sortAsc !== false || filterActiveCount > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setSearch(''); setSortKey('addedAt'); setSortAsc(false); setListPage(1); clearFilters() }}
          >
            <X className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}

        {/* Filter panel */}
        <div className="relative" ref={filterPanelRef}>
          <Button
            variant={showFilterPanel || filterActiveCount > 0 ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => setShowFilterPanel((v) => !v)}
            title="Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {filterActiveCount > 0 && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center leading-none">
                {filterActiveCount}
              </span>
            )}
          </Button>

          {showFilterPanel && (
            <div className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-border bg-popover shadow-lg p-4 space-y-4">
              {/* Watch Status */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Watch Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['watched', 'unwatched', 'in_progress', 'now_playing'] as WatchStatus[]).map((s) => {
                    const tooltips: Record<string, string> = {
                      watched: 'At least one user has finished watching',
                      unwatched: 'No user has watched this yet',
                      in_progress: 'Watching is in progress but not finished',
                      now_playing: 'Currently streaming in Plex',
                    }
                    return (
                      <button
                        key={s}
                        title={tooltips[s]}
                        onClick={() => setFilterStatus((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                        className={cn(
                          'px-2.5 py-1 text-xs rounded-full border transition-colors',
                          filterStatus.includes(s)
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                        )}
                      >
                        {s === 'now_playing' ? 'Now Playing' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Media Type */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Media Type</p>
                <div className="flex gap-1.5">
                  {(['all', 'movie', 'show'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterMediaType(t)}
                      className={cn(
                        'px-2.5 py-1 text-xs rounded-full border transition-colors',
                        filterMediaType === t
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'Shows'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Year</p>
                <div className="flex gap-2 items-center">
                  <Input className="h-7 text-xs" placeholder="Min" value={filterMinYear} onChange={(e) => setFilterMinYear(e.target.value.replace(/\D/g, ''))} />
                  <span className="text-muted-foreground text-xs shrink-0">–</span>
                  <Input className="h-7 text-xs" placeholder="Max" value={filterMaxYear} onChange={(e) => setFilterMaxYear(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>

              {/* File Size */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">File Size (GB)</p>
                <div className="flex gap-2 items-center">
                  <Input className="h-7 text-xs" placeholder="Min" value={filterMinSize} onChange={(e) => setFilterMinSize(e.target.value.replace(/[^\d.]/g, ''))} />
                  <span className="text-muted-foreground text-xs shrink-0">–</span>
                  <Input className="h-7 text-xs" placeholder="Max" value={filterMaxSize} onChange={(e) => setFilterMaxSize(e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
              </div>

              {/* Watch Count */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Watch Count</p>
                <div className="flex gap-2 items-center">
                  <Input className="h-7 text-xs" placeholder="Min" value={filterMinWatches} onChange={(e) => setFilterMinWatches(e.target.value.replace(/\D/g, ''))} />
                  <span className="text-muted-foreground text-xs shrink-0">–</span>
                  <Input className="h-7 text-xs" placeholder="Max" value={filterMaxWatches} onChange={(e) => setFilterMaxWatches(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>

              {filterActiveCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 w-full text-xs text-muted-foreground" onClick={clearFilters}>
                  <X className="h-3 w-3 mr-1" /> Clear all filters
                </Button>
              )}

              {/* Exclusions */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Exclusions</p>
                <div className="flex gap-1.5">
                  {(['all', 'excluded', 'not-excluded'] as const).map((v) => {
                    const labels = { all: 'All', excluded: 'Excluded', 'not-excluded': 'Not excluded' }
                    const tooltips = {
                      all: 'Show all items',
                      excluded: 'Only show items permanently excluded from cleanup',
                      'not-excluded': 'Only show items not in the exclusions list',
                    }
                    return (
                      <button
                        key={v}
                        title={tooltips[v]}
                        onClick={() => setFilterExclusion(v)}
                        className={cn(
                          'px-2.5 py-1 text-xs rounded-full border transition-colors',
                          filterExclusion === v
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {labels[v]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={selectMode ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setSelectMode((v) => !v); if (selectMode) setSelected(new Set()) }}
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            Select
          </Button>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {(['S', 'M', 'L'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setGridSize(s)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium transition-colors',
                  gridSize === s ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {s}
              </button>
              ))}
            </div>
          <div className="flex items-center gap-1">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      </div>{/* end sticky top */}

      {/* Letter strip + content: scrollable area fills remaining height */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Scrollable content */}
        <div ref={scrollCallbackRef} className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-6" style={{ willChange: 'transform', maskImage: `linear-gradient(to bottom, ${fadeTop ? 'transparent 0%, black 48px' : 'black 0%'}, black calc(100% - ${fadeBottom ? '48px' : '0px'}), ${fadeBottom ? 'transparent 100%' : 'black 100%'})`, WebkitMaskImage: `linear-gradient(to bottom, ${fadeTop ? 'transparent 0%, black 48px' : 'black 0%'}, black calc(100% - ${fadeBottom ? '48px' : '0px'}), ${fadeBottom ? 'transparent 100%' : 'black 100%'})` }}>
      {viewMode === 'list' ? (
        <>
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Table header */}
          <div className={cn('grid gap-3 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border', listCols)}>
            <button
              onClick={toggleSelectAll}
              className={cn('flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors', !selectMode && 'invisible')}
              title={selected.size === filtered.length ? 'Deselect all' : 'Select all'}
            >
              {filtered.length > 0 && filtered.every((i) => selected.has(i.plexRatingKey))
                ? <CheckSquare className="h-4 w-4 text-primary" />
                : selected.size > 0 && filtered.some((i) => selected.has(i.plexRatingKey))
                  ? <CheckSquare className="h-4 w-4 text-primary opacity-50" />
                  : <Square className="h-4 w-4" />}
            </button>
            <SortBtn k="poster" label="Poster" />
            <SortBtn k="title" label="Title" />
            <SortBtn k="watchStatus" label="Status" />
            <SortBtn k="lastWatchedAt" label="Last Watched" />
            <SortBtn k="addedAt" label="Added" />
            <SortBtn k="fileSizeBytes" label="Size" />
            <SortBtn k="watchCount" label="Plays" />
            <span />
          </div>

          <div className="divide-y divide-border">
            {filtered.slice((listPage - 1) * LIST_PAGE_SIZE, listPage * LIST_PAGE_SIZE).map((item) => {
              const isExpanded = expandedRow === item.plexRatingKey
              const lastWatcher = item.userWatches[0]
              const isSelected = selected.has(item.plexRatingKey)
              return (
                <div key={item.plexRatingKey} className="relative">
                  <div
                    className={cn(
                      'grid gap-3 items-center px-4 hover:bg-accent/30 transition-colors cursor-pointer',
                      listCols, listPy,
                      isSelected && 'bg-primary/5'
                    )}
                    onClick={() => selectMode ? toggleSelect(item.plexRatingKey) : setDetailItem({ plexRatingKey: item.plexRatingKey, title: item.title, year: item.year, mediaType: item.mediaType, posterPath: item.posterUrl ?? null, fileSizeBytes: item.fileSizeBytes, lastWatchedAt: item.lastWatchedAt ?? null, watchCount: item.watchCount, addedAt: item.addedAt })}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelect(item.plexRatingKey) }}
                      className={cn('flex items-center justify-center text-muted-foreground hover:text-primary transition-colors', !selectMode && 'invisible')}
                    >
                      {isSelected
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />}
                    </button>
                    <PosterImage
                      src={item.posterUrl}
                      alt={item.title}
                      mediaType={item.mediaType}
                      width={listPosterW}
                      height={listPosterH}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{item.title}</p>
                      {item.year && <p className="text-xs text-muted-foreground">{item.year}</p>}
                    </div>
                    <WatchBadge status={item.watchStatus} />
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(item.lastWatchedAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.addedAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(item.fileSizeBytes)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.watchCount}×
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : item.plexRatingKey) }}
                      className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 bg-muted/20 border-t border-border">
                      {item.userWatches.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No watch history found for this item.</p>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Watched by {item.userWatches.length} user{item.userWatches.length !== 1 ? 's' : ''}
                            {lastWatcher && (
                              <span className="ml-2 text-primary">· Last: {lastWatcher.userName} {formatRelativeDate(lastWatcher.lastWatchedAt)}</span>
                            )}
                          </p>
                          {item.userWatches.map((w) => (
                            <div key={w.userName} className="flex items-center gap-3 rounded-md px-3 py-1.5 bg-muted/40 text-xs">
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium min-w-24">{w.userName}</span>
                              <span className="text-muted-foreground">{w.watchCount} play{w.watchCount !== 1 ? 's' : ''}</span>
                              <span className="text-muted-foreground ml-auto">Last watched {formatRelativeDate(w.lastWatchedAt)}</span>
                              {w.userName === lastWatcher?.userName && (
                                <Badge variant="secondary" className="text-xs py-0 px-1.5">Most Recent</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* List pagination */}
        {filtered.length > LIST_PAGE_SIZE && (
          <div className="flex items-center justify-between pt-3">
            <p className="text-xs text-muted-foreground">
              Showing {(listPage - 1) * LIST_PAGE_SIZE + 1}–{Math.min(listPage * LIST_PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setListPage((p) => Math.max(1, p - 1))} disabled={listPage === 1}>Previous</Button>
              <span className="text-xs text-muted-foreground">Page {listPage} / {Math.ceil(filtered.length / LIST_PAGE_SIZE)}</span>
              <Button variant="outline" size="sm" onClick={() => setListPage((p) => Math.min(Math.ceil(filtered.length / LIST_PAGE_SIZE), p + 1))} disabled={listPage === Math.ceil(filtered.length / LIST_PAGE_SIZE)}>Next</Button>
            </div>
          </div>
        )}
        </>
      ) : (
        <div className={cn('grid gap-3', gridCols)}>
          {filtered.map((item, idx) => {
            const isSelected = selected.has(item.plexRatingKey)
            const letter = getItemLetter(item.title)
            const isFirstOfLetter = idx === 0 || getItemLetter(filtered[idx - 1].title) !== letter
            return (
            <div
              key={item.plexRatingKey}
              className="group cursor-pointer relative"
              onClick={() => selectMode ? toggleSelect(item.plexRatingKey) : setDetailItem({ plexRatingKey: item.plexRatingKey, title: item.title, year: item.year, mediaType: item.mediaType, posterPath: item.posterUrl ?? null, fileSizeBytes: item.fileSizeBytes, lastWatchedAt: item.lastWatchedAt ?? null, watchCount: item.watchCount, addedAt: item.addedAt })}
            >
              {isFirstOfLetter && (
                <span
                  id={`letter-section-${letter}`}
                  data-letter-section={letter}
                  className="absolute -top-px"
                />
              )}
              {/* Poster */}
              <div className={cn(
                'relative rounded-lg overflow-hidden border aspect-[2/3] bg-muted transition-[border-color,box-shadow]',
                isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
              )}>
                <PosterImage
                  src={item.posterUrl}
                  alt={item.title}
                  mediaType={item.mediaType}
                  fill
                  className="absolute inset-0"
                  sizes={gridSizes}
                />
                {/* Checkbox overlay */}
                <div
                  className={cn(
                    'absolute top-1.5 left-1.5 z-10 transition-opacity',
                    isSelected ? 'opacity-100' : selectMode ? 'opacity-0 group-hover:opacity-100' : 'hidden'
                  )}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(item.plexRatingKey) }}
                >
                  <div className="rounded bg-black/60 p-0.5">
                    {isSelected
                      ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      : <Square className="h-3.5 w-3.5 text-white" />}
                  </div>
                </div>
                {/* Exclusion shield — top right */}
                {exclusionKeys.has(item.plexRatingKey) && (
                  <div className="absolute top-1.5 right-1.5 z-10 rounded bg-black/60 p-0.5" title="Permanently excluded from cleanup">
                    <ShieldBan className="h-3.5 w-3.5 text-orange-400" />
                  </div>
                )}
                {/* Watch badge */}
                <div className="absolute bottom-1.5 left-1.5 right-1.5 z-10">
                  <WatchBadge status={item.watchStatus} />
                </div>
              </div>
              {/* Info */}
              <div className="mt-1.5">
                <p className="text-[11px] font-medium leading-tight line-clamp-2">{item.title}</p>
                {item.year && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.year}</p>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No items match your filters
        </div>
      )}

        </div>{/* end main content */}

        {/* Letter strip — right sticky sidebar, grid only */}
        {viewMode === 'grid' && (
        <div className="flex flex-col items-center shrink-0 py-2 w-6 justify-between border-l border-border/30">
          {LETTERS.map((l, i) => {
            const count = letterCounts[l] ?? 0
            const active = currentLetter === l
            const showDivider = i > 0
            return (
              <div key={l} className="flex-1 flex flex-col items-center w-full relative">
                {showDivider && (
                  <div className={cn(
                    'w-3 border-t absolute top-0 left-1/2 -translate-x-1/2',
                    count > 0 ? 'border-muted-foreground/40' : 'border-muted-foreground/10'
                  )} />
                )}
                <button
                  onClick={() => {
                    if (!count) return
                    const el = document.getElementById(`letter-section-${l}`)
                    if (el && scrollRef.current) {
                      const top = el.offsetTop - scrollRef.current.offsetTop
                      scrollRef.current.scrollTo({ top, behavior: 'smooth' })
                    }
                    setCurrentLetter('')
                  }}
                  className={cn(
                    'flex-1 w-full flex items-center justify-center text-[13px] font-semibold leading-none rounded transition-colors select-none',
                    active
                      ? 'text-muted-foreground'
                      : count > 0
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'text-muted-foreground/15 cursor-default'
                  )}
                >
                  {l}
                </button>
              </div>
            )
          })}
        </div>
        )}
      </div>{/* end letter strip + content */}
    </div>
  )
}
