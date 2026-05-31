'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PosterImage from '@/components/media/PosterImage'
import WatchBadge from '@/components/media/WatchBadge'
import type { WatchStatus } from '@/types'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import {
  RefreshCw, AlertTriangle, ShieldBan, Trash2, Search, LayoutGrid, List,
  X, CheckSquare, Square, SlidersHorizontal, Film, Tv
} from 'lucide-react'
import { cn } from '@/lib/utils'
import MediaDetailPanel from '@/components/media/MediaDetailPanel'
import type { MediaDetailItem } from '@/components/media/MediaDetailPanel'

interface PermanentExclusion {
  id: string
  plexRatingKey: string
  title: string
  year?: number | null
  mediaType: string
  posterPath?: string | null
  addedAt: string
  watchStatus?: WatchStatus | null
}

type SortKey = 'title' | 'addedAt' | 'year' | 'mediaType'

export default function ExclusionsPage() {
  const [exclusions, setExclusions] = useState<PermanentExclusion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [detailItem, setDetailItem] = useState<MediaDetailItem | null>(null)

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [gridSize, setGridSize] = useState<'S' | 'M' | 'L'>('S')
  const [currentLetter, setCurrentLetter] = useState<string>('')

  const gridCols = gridSize === 'S' ? 'grid-cols-[repeat(13,minmax(0,1fr))]' : gridSize === 'M' ? 'grid-cols-6 sm:grid-cols-7 md:grid-cols-9' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'
  const gridSizes = gridSize === 'S' ? '8vw' : gridSize === 'M' ? '16vw' : '25vw'

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('addedAt')
  const [sortAsc, setSortAsc] = useState(false)

  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const [filterMediaType, setFilterMediaType] = useState<'all' | 'movie' | 'show'>('all')
  const [filterMinYear, setFilterMinYear] = useState('')
  const [filterMaxYear, setFilterMaxYear] = useState('')
  const [filterWatchStatus, setFilterWatchStatus] = useState<string[]>([])

  const listPosterW = gridSize === 'S' ? 36 : gridSize === 'L' ? 60 : 44
  const listPosterH = gridSize === 'S' ? 52 : gridSize === 'L' ? 86 : 64
  const listPy = gridSize === 'S' ? 'py-1.5' : gridSize === 'L' ? 'py-5' : 'py-3'
  const listCols =
    gridSize === 'S' ? 'grid-cols-[28px_48px_1fr_100px_130px]' :
    gridSize === 'L' ? 'grid-cols-[28px_76px_1fr_100px_130px]' :
                      'grid-cols-[28px_60px_1fr_100px_130px]'

  const filtered = exclusions
    .filter((e) => {
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterMediaType !== 'all' && e.mediaType !== filterMediaType) return false
      if (filterMinYear !== '' && (e.year == null || e.year < Number(filterMinYear))) return false
      if (filterMaxYear !== '' && (e.year == null || e.year > Number(filterMaxYear))) return false
      if (filterWatchStatus.length > 0 && !filterWatchStatus.includes(e.watchStatus ?? '')) return false
      return true
    })
    .sort((a, b) => {
      if (sortKey === 'title') {
        const va = a.title.toLowerCase(), vb = b.title.toLowerCase()
        return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
      }
      if (sortKey === 'mediaType') {
        return sortAsc ? a.mediaType.localeCompare(b.mediaType) : b.mediaType.localeCompare(a.mediaType)
      }
      if (sortKey === 'year') {
        const va = a.year ?? 0, vb = b.year ?? 0
        return sortAsc ? va - vb : vb - va
      }
      const va = new Date(a.addedAt).getTime()
      const vb = new Date(b.addedAt).getTime()
      return sortAsc ? va - vb : vb - va
    })

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollListenerCleanup = useRef<(() => void) | null>(null)
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)

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

  const updateFade = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setFadeTop(el.scrollTop > 8)
    setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 8)
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/exclusions')
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d)) throw new Error(d.error ?? 'Failed to load exclusions')
        setExclusions(d)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { updateFade() }, [filtered.length, updateFade])

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
  }, [exclusions.length, search, filterMediaType, filterMinYear, filterMaxYear, filterWatchStatus, viewMode])

  const clearFilters = () => {
    setFilterMediaType('all')
    setFilterMinYear('')
    setFilterMaxYear('')
    setFilterWatchStatus([])
  }

  const filterActiveCount = [
    filterMediaType !== 'all',
    filterMinYear !== '',
    filterMaxYear !== '',
    filterWatchStatus.length > 0,
  ].filter(Boolean).length

  const LETTERS = ['#', 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

  const getItemLetter = (title: string) => {
    const clean = title.replace(/^(the |a |an )/i, '').trim()
    const first = clean[0]?.toUpperCase() ?? ''
    return /[A-Z]/.test(first) ? first : '#'
  }

  const letterCounts = filtered.reduce<Record<string, number>>((acc, e) => {
    const l = getItemLetter(e.title)
    acc[l] = (acc[l] ?? 0) + 1
    return acc
  }, {})

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (filtered.length > 0 && filtered.every((e) => selected.has(e.id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((e) => e.id)))
    }
  }

  const handleRemove = async () => {
    setConfirmDelete(false)
    setRemoving(true)
    setActionResult(null)
    let failed = 0, removed = 0
    await Promise.all(
      [...selected].map((id) =>
        fetch(`/api/exclusions/${id}`, { method: 'DELETE' })
          .then((r) => { if (r.ok) removed++; else failed++ })
          .catch(() => failed++)
      )
    )
    setExclusions((prev) => prev.filter((e) => !selected.has(e.id)))
    setSelected(new Set())
    setActionResult({
      ok: failed === 0,
      message: failed === 0
        ? `Removed ${removed} exclusion${removed !== 1 ? 's' : ''}.`
        : `Removed ${removed}, failed ${failed}.`,
    })
    setRemoving(false)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={cn(
        'text-xs font-medium px-2 py-1 rounded hover:bg-accent transition-colors',
        sortKey === k ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      {label} {sortKey === k ? (sortAsc ? '\u2191' : '\u2193') : ''}
    </button>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading\u2026</span>
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

  return (
    <div data-fullheight className="absolute inset-0 flex flex-col overflow-hidden">
      <MediaDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
      <div className="px-6 pt-6 pb-4 space-y-4 shrink-0">
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Remove {selected.size} exclusion{selected.size !== 1 ? 's' : ''}?
              </DialogTitle>
              <DialogDescription>
                These items will no longer be excluded from cleanup reports. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRemove} disabled={removing}>
                {removing
                  ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  : <Trash2 className="h-4 w-4 mr-2" />}
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldBan className="h-6 w-6 text-orange-400" />
              Exclusions
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {filtered.length < exclusions.length
                ? <>{filtered.length} of {exclusions.length} items · excluded from cleanup reports</>
                : <>{exclusions.length} item{exclusions.length !== 1 ? 's' : ''} · excluded from cleanup reports</>}
            </p>
          </div>
        </div>

        {/* Selection action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="destructive" size="sm" disabled={removing} onClick={() => setConfirmDelete(true)}>
                {removing
                  ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                Remove exclusion{selected.size !== 1 ? 's' : ''}
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSelected(new Set())}>
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            </div>
          </div>
        )}

        {/* Action result */}
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

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8"
            />
          </div>

          {(search !== '' || sortKey !== 'addedAt' || sortAsc !== false || filterActiveCount > 0) && (
            <Button
              variant="ghost" size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setSearch(''); setSortKey('addedAt'); setSortAsc(false); clearFilters() }}
            >
              <X className="h-3 w-3 mr-1" /> Reset
            </Button>
          )}

          {/* Filter panel */}
          <div className="relative" ref={filterPanelRef}>
            <Button
              variant={showFilterPanel || filterActiveCount > 0 ? 'secondary' : 'ghost'}
              size="icon" className="h-8 w-8 relative"
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
              <div className="absolute right-0 top-9 z-50 w-64 rounded-lg border border-border bg-popover shadow-lg p-4 space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Media Type</p>
                  <div className="flex gap-1.5">
                    {(['all', 'movie', 'show'] as const).map((t) => (
                      <button
                        key={t}
                        title={t === 'all' ? 'Show all media types' : t === 'movie' ? 'Movies only' : 'TV shows only'}
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
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Watch Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['watched', 'unwatched', 'in_progress'] as const).map((s) => {
                      const tooltips: Record<string, string> = {
                        watched: 'At least one user has finished watching',
                        unwatched: 'No user has watched this yet',
                        in_progress: 'Watching is in progress but not finished',
                      }
                      const labels: Record<string, string> = { watched: 'Watched', unwatched: 'Unwatched', in_progress: 'In Progress' }
                      return (
                        <button
                          key={s}
                          title={tooltips[s]}
                          onClick={() => setFilterWatchStatus((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                          className={cn(
                            'px-2.5 py-1 text-xs rounded-full border transition-colors',
                            filterWatchStatus.includes(s)
                              ? 'bg-primary/20 border-primary/50 text-primary'
                              : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                          )}
                        >
                          {labels[s]}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Year</p>
                  <div className="flex gap-2 items-center">
                    <Input
                      className="h-7 text-xs" placeholder="Min"
                      value={filterMinYear}
                      onChange={(e) => setFilterMinYear(e.target.value.replace(/\D/g, ''))}
                    />
                    <span className="text-muted-foreground text-xs shrink-0">–</span>
                    <Input
                      className="h-7 text-xs" placeholder="Max"
                      value={filterMaxYear}
                      onChange={(e) => setFilterMaxYear(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </div>
                {filterActiveCount > 0 && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 w-full text-xs text-muted-foreground"
                    onClick={clearFilters}
                  >
                    <X className="h-3 w-3 mr-1" /> Clear all filters
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Size + view toggles */}
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
                  key={s} onClick={() => setGridSize(s)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium transition-colors',
                    gridSize === s ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >{s}</button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')}>
                <List className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('grid')}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content + letter strip */}
      <div className="flex flex-1 min-h-0 gap-0">
        <div
          ref={scrollCallbackRef}
          className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-6"
          style={{
            willChange: 'transform',
            maskImage: `linear-gradient(to bottom, ${fadeTop ? 'transparent 0%, black 48px' : 'black 0%'}, black calc(100% - ${fadeBottom ? '48px' : '0px'}), ${fadeBottom ? 'transparent 100%' : 'black 100%'})`,
            WebkitMaskImage: `linear-gradient(to bottom, ${fadeTop ? 'transparent 0%, black 48px' : 'black 0%'}, black calc(100% - ${fadeBottom ? '48px' : '0px'}), ${fadeBottom ? 'transparent 100%' : 'black 100%'})`,
          }}
        >
          {exclusions.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-12 text-center space-y-2">
              <ShieldBan className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground text-sm">No permanent exclusions yet.</p>
              <p className="text-muted-foreground/60 text-xs">
                Select items in a library and click \u201cExclude from cleanup\u201d to add them here.
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className={cn('grid gap-3 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border', listCols)}>
                <button
                  onClick={toggleSelectAll}
                  className={cn('flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors', !selectMode && 'invisible')}
                >
                  {filtered.length > 0 && filtered.every((e) => selected.has(e.id))
                    ? <CheckSquare className="h-4 w-4 text-primary" />
                    : selected.size > 0 && filtered.some((e) => selected.has(e.id))
                      ? <CheckSquare className="h-4 w-4 text-primary opacity-50" />
                      : <Square className="h-4 w-4" />}
                </button>
                <span className="text-xs font-medium text-muted-foreground px-2">Poster</span>
                <SortBtn k="title" label="Title" />
                <SortBtn k="mediaType" label="Type" />
                <SortBtn k="addedAt" label="Excluded On" />
              </div>
              <div className="divide-y divide-border">
                {filtered.map((item) => {
                  const isSelected = selected.has(item.id)
                  return (
                    <div
                      key={item.id}
                      className={cn('grid gap-3 items-center px-4 cursor-pointer hover:bg-accent/30 transition-colors', listCols, listPy, isSelected && 'bg-primary/5')}
                      onClick={() => selectMode ? toggleSelect(item.id) : setDetailItem({ plexRatingKey: item.plexRatingKey, title: item.title, year: item.year, mediaType: item.mediaType, posterPath: item.posterPath ?? null, addedAt: item.addedAt })}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(item.id) }}
                        className={cn('flex items-center justify-center text-muted-foreground hover:text-primary transition-colors', !selectMode && 'invisible')}
                      >
                        {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                      <PosterImage src={item.posterPath} alt={item.title} mediaType={item.mediaType as 'movie' | 'show'} width={listPosterW} height={listPosterH} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        {item.year && <p className="text-xs text-muted-foreground">{item.year}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">{item.mediaType}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(item.addedAt)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className={cn('grid gap-3', gridCols)}>
              {filtered.map((item, idx) => {
                const isSelected = selected.has(item.id)
                const letter = getItemLetter(item.title)
                const isFirstOfLetter = idx === 0 || getItemLetter(filtered[idx - 1].title) !== letter
                return (
                  <div key={item.id} className="group cursor-pointer relative" onClick={() => selectMode ? toggleSelect(item.id) : setDetailItem({ plexRatingKey: item.plexRatingKey, title: item.title, year: item.year, mediaType: item.mediaType, posterPath: item.posterPath ?? null, addedAt: item.addedAt })}>
                    {isFirstOfLetter && (
                      <span
                        id={`letter-section-${letter}`}
                        data-letter-section={letter}
                        className="absolute -top-px"
                      />
                    )}
                    <div className={cn(
                      'relative rounded-lg overflow-hidden border aspect-[2/3] bg-muted transition-[border-color,box-shadow]',
                      isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                    )}>
                      <PosterImage
                        src={item.posterPath}
                        alt={item.title}
                        mediaType={item.mediaType as 'movie' | 'show'}
                        fill
                        className="absolute inset-0"
                        sizes={gridSizes}
                      />
                      <div
                        className={cn('absolute top-1.5 left-1.5 z-10 transition-opacity', isSelected ? 'opacity-100' : selectMode ? 'opacity-0 group-hover:opacity-100' : 'hidden')}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(item.id) }}
                      >
                        <div className="rounded bg-black/60 p-0.5">
                          {isSelected
                            ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                            : <Square className="h-3.5 w-3.5 text-white" />}
                        </div>
                      </div>
                      {/* Shield icon — top right */}
                      <div className="absolute top-1.5 right-1.5 z-10 rounded bg-black/60 p-0.5" title="Permanently excluded from cleanup">
                        <ShieldBan className="h-3.5 w-3.5 text-orange-400" />
                      </div>
                      {/* Media type + watch status — bottom */}
                      <div className="absolute bottom-1.5 left-1.5 right-1.5 z-10 flex flex-col items-start gap-1">
                        <div
                          title={item.mediaType === 'movie' ? 'Movie' : 'TV Show'}
                          className={`inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold ${item.mediaType === 'movie' ? 'text-sky-400' : 'text-violet-400'}`}
                        >
                          {item.mediaType === 'movie' ? <Film className="h-3 w-3 shrink-0" /> : <Tv className="h-3 w-3 shrink-0" />}
                          {item.mediaType === 'movie' ? 'Movie' : 'Show'}
                        </div>
                        {item.watchStatus && <WatchBadge status={item.watchStatus} />}
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <p className="text-[11px] font-medium leading-tight line-clamp-2">{item.title}</p>
                      {item.year && <p className="text-[10px] text-muted-foreground mt-0.5">{item.year}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {filtered.length === 0 && exclusions.length > 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No items match your filters
            </div>
          )}
        </div>

        {viewMode === 'grid' && (
          <div className="flex flex-col items-center shrink-0 py-2 w-6 justify-between border-l border-border/30">
            {LETTERS.map((l, i) => {
              const count = letterCounts[l] ?? 0
              const active = currentLetter === l
              return (
                <div key={l} className="flex-1 flex flex-col items-center w-full relative">
                  {i > 0 && (
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
      </div>
    </div>
  )
}
