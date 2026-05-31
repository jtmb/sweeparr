'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { cn, formatBytes, formatRelativeDate, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import PosterImage from '@/components/media/PosterImage'
import ReasonTag from '@/components/media/ReasonTag'
import MediaDetailPanel from '@/components/media/MediaDetailPanel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Trash2,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Eye,
  Search,
  ShieldBan,
  RotateCcw,
  Download,
  Pause,
  Play,
  Square,
  CheckSquare,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'
import type { ReportItemRow } from '@/types'

interface ReportDetail {
  id: string
  generatedAt: string
  status: string
  totalItems: number
  totalSizeBytes: number
  executedAt?: string
  items: ReportItemRow[]
}

interface PermanentExclusion {
  id: string
  plexRatingKey: string
}

const ITEM_STATUS_STYLES: Record<string, string> = {
  pending: 'text-amber-400',
  deleted: 'text-emerald-400',
  skipped: 'text-muted-foreground',
  error: 'text-rose-400',
}

const LETTERS = ['#','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']
const getItemLetter = (title: string) => {
  const clean = title.replace(/^(the |a |an )/i, '').trim()
  const first = clean[0]?.toUpperCase() ?? ''
  return /[A-Z]/.test(first) ? first : '#'
}

type SortCol = 'poster' | 'title' | 'reason' | 'lastWatched' | 'added' | 'size' | 'status' | null

const PAGE_SIZE = 50
const POLL_INTERVAL_MS = 2000

function SortIcon({ col, activeCol, dir }: { col: SortCol; activeCol: SortCol; dir: 'asc' | 'desc' }) {
  if (col !== activeCol) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-40" />
  return dir === 'asc'
    ? <ChevronUp className="inline h-3 w-3 ml-1" />
    : <ChevronDown className="inline h-3 w-3 ml-1" />
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [report, setReport] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Execution state
  const [executing, setExecuting] = useState(false)
  const [execStartedAt, setExecStartedAt] = useState<number | null>(null)
  const [initialProcessingIds, setInitialProcessingIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [allowPlexDeletion, setAllowPlexDeletion] = useState(false)
  const [saveToExclusions, setSaveToExclusions] = useState(false)
  const [rerunning, setRerunning] = useState(false)
  const [retryingErrors, setRetryingErrors] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [stopping, setStopping] = useState(false)

  // Filter state
  const [hideExcluded, setHideExcluded] = useState(true)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Sliding-window snapshots for rate estimation: { time (ms), processed (count) }
  const pollSnapshotsRef = useRef<Array<{ time: number; processed: number }>>([])
  // Baseline statuses at the moment execution starts — items that change FROM this are "processed"
  const baselineStatusesRef = useRef<Map<string, string>>(new Map())

  // Sort state
  const [sortCol, setSortCol] = useState<SortCol>('size')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Selection + exclusion state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [permanentExclusionKeys, setPermanentExclusionKeys] = useState<Set<string>>(new Set())

  // Search + pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)

  // Select mode (batch operations) + detail panel
  const [selectMode, setSelectMode] = useState(false)
  const [detailItem, setDetailItem] = useState<import('@/components/media/MediaDetailPanel').MediaDetailItem | null>(null)

  // View + grid
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [gridSize, setGridSize] = useState<'S' | 'M' | 'L'>('S')
  // Extra filters
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterMediaType, setFilterMediaType] = useState<'all' | 'movie' | 'show'>('all')
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  // Scroll / letter strip
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollListenerCleanup = useRef<(() => void) | null>(null)
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)
  const [currentLetter, setCurrentLetter] = useState('')

  // ── Polling helpers ──────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/reports/${id}`)
        const data = (await r.json()) as ReportDetail & { error?: string }
        if (!data.error) {
          setReport(data)
          if (data.status === 'COMPLETED' || data.status === 'FAILED' || data.status === 'PAUSED') {
            stopPolling()
            setExecuting(false)
            setExecStartedAt(null)
            setInitialProcessingIds(new Set())
            pollSnapshotsRef.current = []
            baselineStatusesRef.current = new Map()
            setExcluded(new Set())
            setSelected(new Set())
            // Definitive final fetch — ensures all item status writes are committed
            setTimeout(() => {
              fetch(`/api/reports/${id}`)
                .then((r) => r.json())
                .then((final: ReportDetail & { error?: string }) => {
                  if (!final.error) setReport(final)
                })
                .catch(() => {})
            }, 500)
          } else if (data.status === 'EXECUTING') {
            // Record snapshot for sliding-window rate calculation
            const snap_baseline = baselineStatusesRef.current
            const snap_processed = data.items.filter(
              (i: ReportItemRow) => snap_baseline.size > 0
                ? snap_baseline.has(i.id) && i.status !== snap_baseline.get(i.id)
                : i.status !== 'pending' && i.status !== 'skipped'
            ).length
            const snap_now = Date.now()
            pollSnapshotsRef.current.push({ time: snap_now, processed: snap_processed })
            // Keep only snapshots within the last 60 seconds (sliding window)
            const cutoff = snap_now - 60_000
            pollSnapshotsRef.current = pollSnapshotsRef.current.filter((s) => s.time >= cutoff)
          }
        }
      } catch { /* keep polling on transient network error */ }
    }, POLL_INTERVAL_MS)
  }, [id, stopPolling])

  // ── Initial load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch(`/api/reports/${id}`).then((r) => r.json()) as Promise<ReportDetail & { error?: string }>,
      fetch('/api/exclusions').then((r) => r.json()) as Promise<PermanentExclusion[] | { error: string }>,
    ])
      .then(([reportData, exclusionsData]) => {
        if (reportData.error) { setError(reportData.error); return }
        setReport(reportData)

        const permKeys = new Set<string>()
        if (Array.isArray(exclusionsData)) {
          exclusionsData.forEach((e) => permKeys.add(e.plexRatingKey))
          setPermanentExclusionKeys(permKeys)
        }

        // Pre-populate excluded set for pending items matching a permanent exclusion
        if (reportData.items && permKeys.size > 0) {
          const preExcluded = new Set<string>(
            reportData.items
              .filter((item) => item.status === 'pending' && permKeys.has(item.plexRatingKey))
              .map((item) => item.id)
          )
          setExcluded(preExcluded)
        }

        // If already executing (e.g. page reload mid-run), seed progress state and start polling
        if (reportData.status === 'EXECUTING') {
          // skipped items were excluded before execution; everything else is in-scope for the executor
          const processingIds = new Set<string>(
            reportData.items
              .filter((i) => i.status !== 'skipped')
              .map((i) => i.id)
          )
          setInitialProcessingIds(processingIds)
          // On reload we don’t know the original baseline — treat current status as baseline
          // so only future poll-driven changes count toward progress
          baselineStatusesRef.current = new Map(
            reportData.items
              .filter((i) => i.status !== 'skipped')
              .map((i) => [i.id, i.status])
          )
          setExecStartedAt(Date.now())
          setExecuting(true)
          startPolling()
        }

        // If paused on reload, seed progress state so the bar shows correct counts
        if (reportData.status === 'PAUSED') {
          const nonSkipped = reportData.items.filter((i) => i.status !== 'skipped')
          setInitialProcessingIds(new Set<string>(nonSkipped.map((i) => i.id)))
          // Baseline = 'pending' so items that have already been processed count correctly
          baselineStatusesRef.current = new Map(nonSkipped.map((i) => [i.id, 'pending']))
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id, startPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  // Filter panel outside-click
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

  const handleColSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir(col === 'size' ? 'desc' : 'asc')
    }
    setPage(0)
    setSelected(new Set())
  }

  // Sorted + filtered items
  const sortedItems = useMemo(() => {
    if (!report) return []
    let items = [...report.items]

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      items = items.filter((i) => i.title.toLowerCase().includes(q))
    }

    if (hideExcluded) {
      items = items.filter((i) => !excluded.has(i.id) && i.status !== 'skipped')
    }

    if (filterStatus.length > 0) {
      items = items.filter((i) => filterStatus.includes(i.status))
    }

    if (filterMediaType !== 'all') {
      items = items.filter((i) => i.mediaType === filterMediaType)
    }

    if (!sortCol) return items
    items.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'poster':
          cmp = (a.posterPath ? 1 : 0) - (b.posterPath ? 1 : 0)
          break
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'reason':
          cmp = (a.reasons[0] ?? '').localeCompare(b.reasons[0] ?? '')
          break
        case 'lastWatched': {
          const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0
          const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0
          cmp = ta - tb
          break
        }
        case 'added':
          cmp = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
          break
        case 'size':
          cmp = a.fileSizeBytes - b.fileSizeBytes
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return items
  }, [report, sortCol, sortDir, searchQuery, hideExcluded, excluded, filterStatus, filterMediaType])

  const letterCounts = useMemo(
    () => sortedItems.reduce<Record<string, number>>((acc, i) => {
      const l = getItemLetter(i.title)
      acc[l] = (acc[l] ?? 0) + 1
      return acc
    }, {}),
    [sortedItems]
  )

  // Letter section observer (grid mode)
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
  }, [sortedItems.length, viewMode])

  const pendingItems = useMemo(
    () => (report?.items ?? []).filter((i) => i.status === 'pending'),
    [report]
  )

  const erroredItems = useMemo(
    () => (report?.items ?? []).filter((i) => i.status === 'error'),
    [report]
  )

  const totalPages = Math.ceil(sortedItems.length / PAGE_SIZE)
  const pagedItems = sortedItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // On completed reports allow selecting any item (for Add to Exclusions);
  // on active/executing reports only pending items are selectable.
  const isCompleted = report?.status === 'COMPLETED'
  const isExecuting = report?.status === 'EXECUTING' || report?.status === 'PAUSED'
  const selectableIds = isCompleted
    ? pagedItems.map((i) => i.id)
    : pagedItems.filter((i) => i.status === 'pending').map((i) => i.id)

  const allPageSelected = selectableIds.length > 0 && selectableIds.every((i) => selected.has(i))
  const somePageSelected = selectableIds.some((i) => selected.has(i))

  const toggleSelect = (itemId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
      return next
    })
  }

  const toggleAll = () => {
    if (allPageSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableIds))
    }
  }

  const handleExclude = () => {
    setExcluded((prev) => new Set([...prev, ...selected]))
    setSelected(new Set())
  }

  const handleUnexclude = () => {
    const toUnexclude = [...selected].filter((i) => excluded.has(i))
    setExcluded((prev) => {
      const next = new Set(prev)
      toUnexclude.forEach((i) => next.delete(i))
      return next
    })
    setSelected(new Set())
  }

  const handleAddToExclusions = async () => {
    if (!report) return
    const itemsToAdd = [...selected]
      .map((selId) => report.items.find((i) => i.id === selId))
      .filter((i): i is ReportItemRow => !!i)
      .map((i) => ({
        plexRatingKey: i.plexRatingKey,
        title: i.title,
        year: i.year ?? null,
        mediaType: i.mediaType,
        posterPath: i.posterPath ?? null,
      }))
    if (itemsToAdd.length === 0) return
    try {
      const res = await fetch('/api/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToAdd }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error: string }
        throw new Error(d.error)
      }
      setPermanentExclusionKeys((prev) => {
        const next = new Set(prev)
        itemsToAdd.forEach((i) => next.add(i.plexRatingKey))
        return next
      })
      setExcluded((prev) => new Set([...prev, ...selected]))
      setSelected(new Set())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleRerun = async () => {
    setRerunning(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as { reportId?: string; error?: string }
      if (!res.ok) throw new Error(data.error)
      router.push(`/reports/${data.reportId}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setRerunning(false)
    }
  }

  const handleRetryErrors = async () => {
    if (!report) return
    setRetryingErrors(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/${id}/retry-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowPlexDeletion: false }),
      })
      const data = (await res.json()) as { ok?: boolean; retryCount?: number; error?: string }
      if (!res.ok) throw new Error(data.error)
      // Re-fetch so we have the exact items that were reset to 'pending' by the retry API.
      // Using stale React state here would give wrong IDs (pre-execution snapshot)
      // and the wrong baseline (items are already 'pending', not 'error', by the time we poll).
      const fresh = (await fetch(`/api/reports/${id}`).then((r) => r.json())) as ReportDetail & { error?: string }
      if (!fresh.error) setReport(fresh)
      const retryIds = new Set((fresh.error ? report : fresh).items.filter((i) => i.status === 'pending').map((i) => i.id))
      setInitialProcessingIds(retryIds)
      // Baseline is 'pending' so transitions to deleted/error/skipped count as progress
      baselineStatusesRef.current = new Map([...retryIds].map((rid) => [rid, 'pending']))
      pollSnapshotsRef.current = []
      setExecStartedAt(Date.now())
      setExecuting(true)
      startPolling()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRetryingErrors(false)
    }
  }

  const handlePause = async () => {
    if (!report) return
    setPausing(true)
    try {
      const res = await fetch(`/api/reports/${id}/pause`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json()) as { error: string }
        throw new Error(data.error)
      }
      // Poll will detect PAUSED status and stop itself
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPausing(false)
    }
  }

  const handleResume = async () => {
    if (!report) return
    setResuming(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/${id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowPlexDeletion }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error: string }
        throw new Error(data.error)
      }
      // Seed progress with currently-pending items
      const pendingIds = new Set(report.items.filter((i) => i.status === 'pending').map((i) => i.id))
      setInitialProcessingIds(pendingIds)
      baselineStatusesRef.current = new Map(
        report.items.filter((i) => i.status === 'pending').map((i) => [i.id, i.status])
      )
      pollSnapshotsRef.current = []
      setExecStartedAt(Date.now())
      setExecuting(true)
      startPolling()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setResuming(false)
    }
  }

  const handleStop = async () => {
    if (!report) return
    setStopping(true)
    try {
      const res = await fetch(`/api/reports/${id}/stop`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json()) as { error: string }
        throw new Error(data.error)
      }
      // Poll will detect COMPLETED/PAUSED→COMPLETED and stop itself
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStopping(false)
    }
  }

  const handleExportCsv = () => {
    if (!report) return
    const headers = ['Title', 'Year', 'Media Type', 'Size (GB)', 'Status', 'Error Message', 'Rule', 'Reasons', 'Added', 'Last Watched']
    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = report.items.map((i) => [
      esc(i.title),
      esc(i.year),
      esc(i.mediaType),
      esc((i.fileSizeBytes / 1e9).toFixed(2)),
      esc(i.status),
      esc(i.errorMessage),
      esc(i.ruleName),
      esc(i.reasons.join('; ')),
      esc(i.addedAt ? new Date(i.addedAt).toISOString().slice(0, 10) : ''),
      esc(i.lastWatchedAt ? new Date(i.lastWatchedAt).toISOString().slice(0, 10) : ''),
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${id}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportHtml = () => {
    if (!report) return
    const deletedCount = report.items.filter((i) => i.status === 'deleted').length
    const skippedCount = report.items.filter((i) => i.status === 'skipped').length
    const errorCount = report.items.filter((i) => i.status === 'error').length
    const pendingCount = report.items.filter((i) => i.status === 'pending').length
    const freedBytes = report.items.filter((i) => i.status === 'deleted').reduce((s, i) => s + i.fileSizeBytes, 0)
    const fmtBytes = (b: number) => {
      if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'
      if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB'
      if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'
      return (b / 1e3).toFixed(0) + ' KB'
    }
    const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString() : '—'

    // Serialize items into a non-executing JSON data block.
    // Only </script> needs escaping to prevent premature tag close.
    const itemsJson = JSON.stringify(report.items.map((i) => ({
      title: i.title,
      year: i.year ?? null,
      mediaType: i.mediaType,
      fileSizeBytes: i.fileSizeBytes,
      status: i.status,
      errorMessage: i.errorMessage ?? null,
      reasons: i.reasons.join(', '),
      lastWatchedAt: i.lastWatchedAt ?? null,
    })))
      .replace(/<\/script>/gi, '<\\/script>')

    const summaryHtml = report.status === 'COMPLETED' ? `
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr>
      <td style="background:#d1fae5;border-radius:8px;padding:16px 20px;text-align:center;width:25%">
        <div style="font-size:28px;font-weight:700;color:#059669">${deletedCount}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Deleted</div>
      </td>
      <td style="width:8px"></td>
      <td style="background:#f3f4f6;border-radius:8px;padding:16px 20px;text-align:center;width:25%">
        <div style="font-size:28px;font-weight:700">${skippedCount}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Skipped</div>
      </td>
      <td style="width:8px"></td>
      <td style="background:${errorCount > 0 ? '#ffe4e6' : '#f3f4f6'};border-radius:8px;padding:16px 20px;text-align:center;width:25%">
        <div style="font-size:28px;font-weight:700;color:${errorCount > 0 ? '#e11d48' : 'inherit'}">${errorCount}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Errors</div>
      </td>
      <td style="width:8px"></td>
      <td style="background:#ede9fe;border-radius:8px;padding:16px 20px;text-align:center;width:25%">
        <div style="font-size:28px;font-weight:700;color:#7c3aed">${fmtBytes(freedBytes)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Space Freed</div>
      </td>
    </tr>
  </table>` : pendingCount > 0 ? `<p style="background:#fef3c7;border-radius:8px;padding:12px 16px;font-size:13px;margin-bottom:20px">${pendingCount} candidate(s) pending review &mdash; ${fmtBytes(report.items.reduce((s,i)=>s+i.fileSizeBytes,0))} freeable</p>` : ''

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cleanup Report \u2013 ${fmtDate(report.generatedAt)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;max-width:1020px;margin:0 auto;padding:24px;font-size:13px}
  h1{font-size:20px;font-weight:700;margin-bottom:4px}
  .meta{color:#6b7280;font-size:13px;margin-bottom:20px}
  table.data{width:100%;border-collapse:collapse;font-size:13px}
  table.data thead tr{background:#f9fafb;border-bottom:2px solid #e5e7eb}
  table.data th{padding:10px 12px;text-align:left;font-weight:600;white-space:nowrap;user-select:none;cursor:pointer}
  table.data th:hover{background:#f1f5f9}
  table.data th.sorted{background:#eff6ff}
  table.data td{padding:8px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top}
  table.data tbody tr:hover{background:#f9fafb}
  .sort-arrow{display:inline-block;margin-left:4px;opacity:0.35;font-size:10px}
  .sort-arrow.active{opacity:1}
  .status-deleted{color:#10b981;font-weight:600}
  .status-skipped{color:#6b7280;font-weight:600}
  .status-error{color:#f43f5e;font-weight:600}
  .status-pending{color:#f59e0b;font-weight:600}
  .err-msg{display:block;color:#f43f5e;font-size:11px;margin-top:2px}
  .controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px}
  .controls-left{display:flex;align-items:center;gap:12px}
  .page-info{color:#6b7280}
  .btn{border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit}
  .btn:hover{background:#f9fafb}
  .btn:disabled{opacity:0.4;cursor:default}
  .btn.active{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
  .page-btns{display:flex;gap:4px;flex-wrap:wrap}
  select.ps{border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;background:#fff;cursor:pointer}
  .footer{color:#9ca3af;font-size:11px;margin-top:20px}
</style>
</head>
<body>
  <h1>Cleanup Report</h1>
  <p class="meta">Generated ${fmtDate(report.generatedAt)}&nbsp;&nbsp;&bull;&nbsp;&nbsp;${report.totalItems} candidates&nbsp;&nbsp;&bull;&nbsp;&nbsp;Status: ${report.status}</p>
  ${summaryHtml}
  <div id="app"></div>
  <p class="footer">Exported from Sweeper on ${new Date().toLocaleString()}</p>
<script type="application/json" id="rdata">${itemsJson}</script>
<script>
(function(){
  try {
  var ITEMS = JSON.parse(document.getElementById('rdata').textContent);
  var sortCol = 'fileSizeBytes', sortDir = 'desc', page = 1, pageSize = 50;

  var COLS = [
    {key:'title',     label:'Title'},
    {key:'mediaType', label:'Type'},
    {key:'fileSizeBytes', label:'Size'},
    {key:'status',    label:'Status'},
    {key:'reasons',   label:'Reasons'},
    {key:'lastWatchedAt', label:'Last Watched'},
  ];

  function fmtBytes(b){
    if(b>=1e12) return (b/1e12).toFixed(2)+' TB';
    if(b>=1e9)  return (b/1e9).toFixed(2)+' GB';
    if(b>=1e6)  return (b/1e6).toFixed(1)+' MB';
    return (b/1e3).toFixed(0)+' KB';
  }
  function fmtDate(d){ return d ? new Date(d).toLocaleDateString() : '\u2014'; }
  function esc(s){ return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function sorted(){
    var arr = ITEMS.slice();
    arr.sort(function(a,b){
      var av=a[sortCol], bv=b[sortCol];
      if(sortCol==='lastWatchedAt'){
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else if(typeof av==='string') {
        av=av.toLowerCase(); bv=(bv||'').toLowerCase();
      }
      if(av<bv) return sortDir==='asc'?-1:1;
      if(av>bv) return sortDir==='asc'?1:-1;
      return 0;
    });
    return arr;
  }

  function totalPages(items){ return Math.max(1, Math.ceil(items.length/pageSize)); }

  function render(){
    var items = sorted();
    var tp = totalPages(items);
    if(page>tp) page=tp;
    var start=(page-1)*pageSize, end=Math.min(start+pageSize, items.length);
    var slice=items.slice(start,end);

    // header
    var ths = COLS.map(function(c){
      var arrow = sortCol===c.key ? (sortDir==='asc'?'\u25b2':'\u25bc') : '\u25bc';
      var activeClass = sortCol===c.key?' sorted':'';
      var arrowClass = sortCol===c.key?' active':'';
      return '<th class="'+activeClass+'" onclick="setSort(\\''+c.key+'\\')">'
        +esc(c.label)+'<span class="sort-arrow'+arrowClass+'">'+arrow+'</span></th>';
    }).join('');

    // rows
    var trs = slice.map(function(i){
      var statusCls = 'status-'+(i.status||'pending');
      var errHtml = i.errorMessage ? '<span class="err-msg">'+esc(i.errorMessage)+'</span>' : '';
      return '<tr>'
        +'<td style="font-weight:500">'+esc(i.title)+(i.year?' <span style="color:#6b7280;font-weight:400">('+i.year+')</span>':'')+'</td>'
        +'<td style="color:#6b7280;text-transform:capitalize">'+esc(i.mediaType)+'</td>'
        +'<td style="color:#6b7280">'+fmtBytes(i.fileSizeBytes)+'</td>'
        +'<td><span class="'+statusCls+'">'+esc(i.status)+'</span>'+errHtml+'</td>'
        +'<td style="color:#6b7280">'+esc(i.reasons)+'</td>'
        +'<td style="color:#6b7280">'+fmtDate(i.lastWatchedAt)+'</td>'
        +'</tr>';
    }).join('');

    // page buttons (show max 7 around current)
    var pageBtns='';
    var lo=Math.max(1,page-3), hi=Math.min(tp,page+3);
    if(lo>1) pageBtns+='<button class="btn" onclick="goPage(1)">1</button>'+(lo>2?'<span style="padding:0 4px;color:#9ca3af">\u2026</span>':'');
    for(var p2=lo;p2<=hi;p2++){
      pageBtns+='<button class="btn'+(p2===page?' active':'')+'" onclick="goPage('+p2+')">'+p2+'</button>';
    }
    if(hi<tp) pageBtns+=(hi<tp-1?'<span style="padding:0 4px;color:#9ca3af">\u2026</span>':'')+'<button class="btn" onclick="goPage('+tp+')">'+tp+'</button>';

    var html='<div class="controls">'
      +'<div class="controls-left">'
      +'<span class="page-info">Showing '+(start+1)+'–'+end+' of '+items.length+' items</span>'
      +'<select class="ps" onchange="setPageSize(+this.value)">'
      +[25,50,100,250].map(function(n){return '<option value="'+n+'"'+(n===pageSize?' selected':'')+'>'+n+' per page</option>';}).join('')
      +'</select>'
      +'</div>'
      +'<div class="page-btns">'
      +'<button class="btn" onclick="goPage(page-1)" '+(page<=1?'disabled':'')+'>&#8249; Prev</button>'
      +pageBtns
      +'<button class="btn" onclick="goPage(page+1)" '+(page>=tp?'disabled':'')+'>Next &#8250;</button>'
      +'</div>'
      +'</div>'
      +'<table class="data"><thead><tr>'+ths+'</tr></thead><tbody>'+trs+'</tbody></table>'
      +'<div class="controls" style="margin-top:10px;margin-bottom:0">'
      +'<div class="controls-left"><span class="page-info">Page '+page+' of '+tp+'</span></div>'
      +'<div class="page-btns">'
      +'<button class="btn" onclick="goPage(page-1)" '+(page<=1?'disabled':'')+'>&#8249; Prev</button>'
      +'<button class="btn" onclick="goPage(page+1)" '+(page>=tp?'disabled':'')+'>Next &#8250;</button>'
      +'</div></div>';

    document.getElementById('app').innerHTML=html;
  }

  window.setSort=function(col){
    if(sortCol===col){ sortDir=sortDir==='asc'?'desc':'asc'; } else { sortCol=col; sortDir='desc'; }
    page=1; render();
  };
  window.goPage=function(p){ var items=sorted(); var tp=totalPages(items); page=Math.max(1,Math.min(tp,p)); render(); };
  window.setPageSize=function(n){ pageSize=n; page=1; render(); };

  render();
  } catch(e) {
    document.getElementById('app').innerHTML='<p style="color:#f43f5e;padding:16px;font-family:monospace">Export script error: '+String(e)+'</p>';
  }
})();
</script>
</body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${id}-${new Date().toISOString().slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectedExcluded = [...selected].filter((i) => excluded.has(i))
  const selectedNotExcluded = [...selected].filter((i) => !excluded.has(i))

  const handleExecute = async () => {
    setDialogOpen(false)
    setExecuting(true)
    setError(null)

    const excludedPendingItems = pendingItems.filter((i) => excluded.has(i.id))
    const excludedPendingIds = excludedPendingItems.map((i) => i.id)
    const saveItems = saveToExclusions
      ? excludedPendingItems.map((i) => ({
          plexRatingKey: i.plexRatingKey,
          title: i.title,
          year: i.year ?? null,
          mediaType: i.mediaType,
          posterPath: i.posterPath ?? null,
        }))
      : []

    // Track which items the executor will process (pending and NOT excluded)
    const toProcess = pendingItems.filter((i) => !excluded.has(i.id))
    const processingIds = new Set(toProcess.map((i) => i.id))
    setInitialProcessingIds(processingIds)
    // Capture baseline so we only count status *changes* toward progress
    baselineStatusesRef.current = new Map(toProcess.map((i) => [i.id, i.status]))

    try {
      const res = await fetch(`/api/reports/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeItemIds: excludedPendingIds, allowPlexDeletion, saveExclusionItems: saveItems }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error: string }
        throw new Error(data.error)
      }
      if (saveItems.length > 0) {
        setPermanentExclusionKeys((prev) => {
          const next = new Set(prev)
          saveItems.forEach((i) => next.add(i.plexRatingKey))
          return next
        })
      }
      setExecStartedAt(Date.now())
      setAllowPlexDeletion(false)
      setSaveToExclusions(false)
      // Refresh to get skipped items reflected in DB
      const updated = (await fetch(`/api/reports/${id}`).then((r) => r.json())) as ReportDetail & { error?: string }
      if (!updated.error) setReport(updated)
      startPolling()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setExecuting(false)
      setInitialProcessingIds(new Set())
    }
  }

  // Progress during execution
  const { processedCount, totalProcessingCount, progressPct, timeRemainingStr, currentItem } = useMemo(() => {
    if (!executing || initialProcessingIds.size === 0 || !report) {
      return { processedCount: 0, totalProcessingCount: 0, progressPct: 0, timeRemainingStr: null, currentItem: null }
    }
    const total = initialProcessingIds.size
    // Count items that have changed FROM their baseline status (i.e. the executor finished them)
    const baseline = baselineStatusesRef.current
    const processed = report.items.filter(
      (i) => initialProcessingIds.has(i.id) && i.status !== (baseline.get(i.id) ?? 'pending')
    ).length
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0

    // The item currently being processed = first tracked item still at its baseline status
    const baselineStatus = baseline.size > 0 ? undefined : 'pending'
    const activeItem = report.items.find(
      (i) => initialProcessingIds.has(i.id) &&
        i.status === (baseline.get(i.id) ?? baselineStatus ?? 'pending')
    ) ?? null

    let timeStr: string | null = null
    if (processed > 0 && pct < 100) {
      const remaining = total - processed
      const snapshots = pollSnapshotsRef.current
      if (snapshots.length >= 2) {
        // Sliding window: rate from oldest snapshot in window to newest
        const oldest = snapshots[0]
        const newest = snapshots[snapshots.length - 1]
        const timeDelta = (newest.time - oldest.time) / 1000
        const countDelta = newest.processed - oldest.processed
        if (countDelta > 0 && timeDelta > 0) {
          const rate = countDelta / timeDelta // items/sec
          const secsLeft = Math.round(remaining / rate)
          timeStr = secsLeft < 60
            ? `~${Math.max(secsLeft, 1)}s remaining`
            : `~${Math.ceil(secsLeft / 60)}m remaining`
        } else {
          // No progress in window — items are stalling
          timeStr = 'processing…'
        }
      } else if (execStartedAt) {
        // Not enough snapshots yet — fall back to overall average
        const elapsed = (Date.now() - execStartedAt) / 1000
        const secsLeft = Math.round((elapsed * remaining) / processed)
        timeStr = secsLeft < 60
          ? `~${Math.max(secsLeft, 1)}s remaining`
          : `~${Math.ceil(secsLeft / 60)}m remaining`
      }
    }
    return { processedCount: processed, totalProcessingCount: total, progressPct: pct, timeRemainingStr: timeStr, currentItem: activeItem }
  }, [report, executing, initialProcessingIds, execStartedAt])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!report || (error && !report)) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive">{error ?? 'Report not found'}</p>
      </div>
    )
  }

  const canExecute = report.status === 'READY' && !executing
  const arrManagedItems = pendingItems.filter(
    (i) => (i.mediaType === 'movie' && !!i.radarrId) || (i.mediaType === 'show' && !!i.sonarrId)
  )
  const unmanagedItems = pendingItems.filter(
    (i) => !((i.mediaType === 'movie' && !!i.radarrId) || (i.mediaType === 'show' && !!i.sonarrId))
  )
  const excludedPendingItems = pendingItems.filter((i) => excluded.has(i.id))
  const excludedPendingCount = excludedPendingItems.length
  const excludedSizeBytes = excludedPendingItems.reduce((s, i) => s + i.fileSizeBytes, 0)
  const arrManagedToProcess = arrManagedItems.filter((i) => !excluded.has(i.id))
  const unmanagedToProcess = unmanagedItems.filter((i) => !excluded.has(i.id))
  const effectiveCandidates = allowPlexDeletion
    ? arrManagedToProcess.length + unmanagedToProcess.length
    : arrManagedToProcess.length
  const effectiveBytes = (
    allowPlexDeletion ? [...arrManagedToProcess, ...unmanagedToProcess] : arrManagedToProcess
  ).reduce((s, i) => s + i.fileSizeBytes, 0)

  const colClass = selectMode
    ? 'grid-cols-[32px_60px_1fr_180px_120px_100px_80px_100px]'
    : 'grid-cols-[60px_1fr_180px_120px_100px_80px_100px]'

  const filterActiveCount = [filterStatus.length > 0, filterMediaType !== 'all'].filter(Boolean).length
  const gridCols = gridSize === 'S' ? 'grid-cols-[repeat(10,minmax(0,1fr))]' : gridSize === 'M' ? 'grid-cols-6' : 'grid-cols-4'
  const gridSizes = gridSize === 'S' ? '10vw' : gridSize === 'M' ? '16vw' : '25vw'

  return (
    <div data-fullheight className="absolute inset-0 flex flex-col overflow-hidden">
      <MediaDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
      {/* Sticky top: header + controls */}
      <div className="px-6 pt-6 pb-4 space-y-4 shrink-0 border-b border-border/30">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/reports">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {pendingItems.length + erroredItems.length - excludedPendingCount} Candidates · {formatBytes(pendingItems.reduce((s, i) => s + i.fileSizeBytes, 0) + erroredItems.reduce((s, i) => s + i.fileSizeBytes, 0) - excludedSizeBytes)}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Generated {formatDate(report.generatedAt)} · Status:{' '}
            <span className="font-medium">{report.status}</span>
            {excludedPendingCount > 0 && (
              <span className="ml-2 text-orange-400">· {excludedPendingCount} excluded ({formatBytes(excludedSizeBytes)} skipped)</span>
            )}
          </p>
        </div>

        {/* Rerun button — only on completed reports */}
        {report.status === 'COMPLETED' && (
          <Button variant="outline" onClick={handleRerun} disabled={rerunning}>
            {rerunning ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Rerun
          </Button>
        )}

        {/* Retry Errors button — only when COMPLETED and has errored items */}
        {report.status === 'COMPLETED' && erroredItems.length > 0 && (
          <Button variant="outline" onClick={handleRetryErrors} disabled={retryingErrors}
            className="text-rose-400 hover:text-rose-300 border-rose-400/30 hover:border-rose-400/60">
            {retryingErrors ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4 mr-2" />
            )}
            Retry {erroredItems.length} Error{erroredItems.length !== 1 ? 's' : ''}
          </Button>
        )}

        {canExecute && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Execute Cleanup
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Cleanup</DialogTitle>
                <DialogDescription>
                  This will permanently delete{' '}
                  <strong>{effectiveCandidates} items</strong> ({formatBytes(effectiveBytes)}) via
                  {allowPlexDeletion ? ' Radarr/Sonarr and Plex.' : ' Radarr/Sonarr.'}
                  {excludedPendingCount > 0 && (
                    <> {excludedPendingCount} excluded items will be skipped.</>
                  )}{' '}
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowPlexDeletion}
                  onChange={(e) => setAllowPlexDeletion(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                />
                <span>
                  Also delete candidates not tracked by Radarr/Sonarr using Plex direct delete.
                </span>
              </label>
              {excludedPendingCount > 0 && (
                <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveToExclusions}
                    onChange={(e) => setSaveToExclusions(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                  />
                  <span>
                    Save the {excludedPendingCount} excluded item
                    {excludedPendingCount !== 1 ? 's' : ''} to the permanent exclusions list.
                  </span>
                </label>
              )}
              {unmanagedToProcess.length > 0 && !allowPlexDeletion && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  {unmanagedToProcess.length} selected item(s) are not in Radarr/Sonarr and will be skipped unless you enable Plex direct delete.
                </div>
              )}
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Media files will be removed from disk. Make sure your rules are correct before
                proceeding.
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleExecute} disabled={effectiveCandidates === 0}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {effectiveCandidates} Items
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {executing && (
          <>
            <Button variant="outline" onClick={handlePause} disabled={pausing || stopping}
              className="text-amber-400 hover:text-amber-300 border-amber-400/30 hover:border-amber-400/60">
              {pausing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Pause className="h-4 w-4 mr-2" />
              )}
              Pause
            </Button>
            <Button variant="outline" onClick={handleStop} disabled={stopping || pausing}
              className="text-rose-400 hover:text-rose-300 border-rose-400/30 hover:border-rose-400/60">
              {stopping ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Stop
            </Button>
            <Button disabled>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Executing…
            </Button>
          </>
        )}

        {report.status === 'PAUSED' && !executing && (
          <>
            <Button variant="outline" onClick={handleResume} disabled={resuming || stopping}
              className="text-blue-400 hover:text-blue-300 border-blue-400/30 hover:border-blue-400/60">
              {resuming ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Resume
            </Button>
            <Button variant="outline" onClick={handleStop} disabled={stopping}
              className="text-rose-400 hover:text-rose-300 border-rose-400/30 hover:border-rose-400/60">
              {stopping ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Stop
            </Button>
          </>
        )}
      </div>

      {/* Progress bar — visible while executing or paused */}
      {(executing || report.status === 'PAUSED') && initialProcessingIds.size > 0 && (
        <div className={`rounded-lg border p-4 space-y-2 ${report.status === 'PAUSED' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/30'}`}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {report.status === 'PAUSED' && (
                <span className="text-amber-400 mr-2">Paused —</span>
              )}
              {processedCount} of {totalProcessingCount} items processed
            </span>
            <span className="text-muted-foreground text-xs">
              {report.status === 'PAUSED'
                ? `${progressPct}%`
                : timeRemainingStr ?? (progressPct === 0 ? 'Starting…' : `${progressPct}%`)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${report.status === 'PAUSED' ? 'bg-amber-400' : 'bg-primary'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{progressPct}% complete</p>
            {currentItem && report.status === 'EXECUTING' && (
              <p className="text-xs text-muted-foreground truncate max-w-[60%] text-right" title={currentItem.title}>
                Deleting: <span className="text-foreground">{currentItem.title}{currentItem.year ? ` (${currentItem.year})` : ''}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Execution summary — visible for completed reports */}
      {report.status === 'COMPLETED' && (() => {
        const deletedCount = report.items.filter((i) => i.status === 'deleted').length
        const skippedCount = report.items.filter((i) => i.status === 'skipped').length
        const errorCount = report.items.filter((i) => i.status === 'error').length
        const freedBytes = report.items
          .filter((i) => i.status === 'deleted')
          .reduce((s, i) => s + i.fileSizeBytes, 0)
        return (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Execution Summary</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleExportCsv} className="h-7 gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button size="sm" variant="outline" onClick={handleExportHtml} className="h-7 gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  HTML
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                <p className="text-xl font-bold text-emerald-400">{deletedCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Deleted</p>
              </div>
              <div className="rounded-md bg-muted/50 border border-border p-3 text-center">
                <p className="text-xl font-bold">{skippedCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Skipped</p>
              </div>
              <div className={`rounded-md border p-3 text-center ${errorCount > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-muted/50 border-border'}`}>
                <p className={`text-xl font-bold ${errorCount > 0 ? 'text-rose-400' : ''}`}>{errorCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Errors</p>
              </div>
              <div className="rounded-md bg-primary/10 border border-primary/20 p-3 text-center">
                <p className="text-xl font-bold text-primary">{formatBytes(freedBytes)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Space Freed</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Search + filter toolbar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search items…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(0)
              setSelected(new Set())
            }}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setPage(0) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <button
          onClick={() => { setHideExcluded((v) => !v); setPage(0) }}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
            hideExcluded
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          {hideExcluded ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {hideExcluded ? 'Show excluded' : 'Hide excluded'}
        </button>
        {/* Filter panel */}
        <div className="relative" ref={filterPanelRef}>
          <button
            onClick={() => setShowFilterPanel((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              showFilterPanel || filterActiveCount > 0
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {filterActiveCount > 0 && (
              <span className="h-4 w-4 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
                {filterActiveCount}
              </span>
            )}
          </button>
          {showFilterPanel && (
            <div className="absolute right-0 top-10 z-50 w-64 rounded-lg border border-border bg-popover shadow-xl p-4 space-y-4">
              {/* Status filter */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['pending', 'deleted', 'skipped', 'error'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                      )}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                        filterStatus.includes(s)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {/* Media type filter */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Type</p>
                <div className="flex gap-1.5">
                  {(['all', 'movie', 'show'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterMediaType(t)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                        filterMediaType === t
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {filterActiveCount > 0 && (
                <button
                  onClick={() => { setFilterStatus([]); setFilterMediaType('all') }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setSelectMode((v) => {
              if (v) setSelected(new Set())
              return !v
            })
          }}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
            selectMode
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Select
        </button>
        {/* Grid size buttons — grid mode only */}
        {viewMode === 'grid' && (
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {(['S', 'M', 'L'] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => setGridSize(sz)}
                className={cn(
                  'h-6 w-6 rounded text-xs font-semibold transition-colors',
                  gridSize === sz
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {sz}
              </button>
            ))}
          </div>
        )}
        {/* List / Grid view toggle */}
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1 rounded transition-colors',
              viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1 rounded transition-colors',
              viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Batch action toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-primary/5 px-4 py-2 text-sm">
          <span className="text-muted-foreground">{selected.size} selected</span>
          {selectedNotExcluded.length > 0 && !isCompleted && (
            <Button size="sm" variant="outline" onClick={handleExclude} className="h-7 gap-1.5">
              <EyeOff className="h-3.5 w-3.5" />
              Exclude {selectedNotExcluded.length}
            </Button>
          )}
          {selectedExcluded.length > 0 && !isCompleted && (
            <Button size="sm" variant="outline" onClick={handleUnexclude} className="h-7 gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Un-exclude {selectedExcluded.length}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddToExclusions}
            className="h-7 gap-1.5 text-orange-400 hover:text-orange-300 border-orange-400/30 hover:border-orange-400/60"
          >
            <ShieldBan className="h-3.5 w-3.5" />
            Add to Exclusions ({selected.size})
          </Button>
          <button
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}
      </div>{/* end sticky top */}

      {/* Scrollable content + letter strip */}
      <div className="flex flex-1 min-h-0 gap-0">
        <div
          ref={scrollCallbackRef}
          className="flex-1 overflow-y-auto scrollbar-thin px-6 pt-4 pb-6"
          style={{ willChange: 'transform', maskImage: `linear-gradient(to bottom, ${fadeTop ? 'transparent 0%, black 48px' : 'black 0%'}, black calc(100% - ${fadeBottom ? '48px' : '0px'}), ${fadeBottom ? 'transparent 100%' : 'black 100%'})`, WebkitMaskImage: `linear-gradient(to bottom, ${fadeTop ? 'transparent 0%, black 48px' : 'black 0%'}, black calc(100% - ${fadeBottom ? '48px' : '0px'}), ${fadeBottom ? 'transparent 100%' : 'black 100%'})` }}
        >
          {viewMode === 'list' ? (
            /* List view */
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Column headers */}
              <div
                className={`grid ${colClass} gap-3 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border sticky top-0 z-10`}
              >
                {/* Select-all checkbox — only in select mode */}
                {selectMode && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected }}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                    />
                  </div>
                )}

                {/* Poster */}
                <button
                  onClick={() => handleColSort('poster')}
                  className={`text-left transition-colors hover:text-foreground ${sortCol === 'poster' ? 'text-primary' : ''}`}
                >
                  Poster<SortIcon col="poster" activeCol={sortCol} dir={sortDir} />
                </button>

                {/* Title */}
                <button
                  onClick={() => handleColSort('title')}
                  className={`text-left transition-colors hover:text-foreground ${sortCol === 'title' ? 'text-primary' : ''}`}
                >
                  Title<SortIcon col="title" activeCol={sortCol} dir={sortDir} />
                </button>

                {/* Reason */}
                <button
                  onClick={() => handleColSort('reason')}
                  className={`text-left transition-colors hover:text-foreground ${sortCol === 'reason' ? 'text-primary' : ''}`}
                >
                  Reason<SortIcon col="reason" activeCol={sortCol} dir={sortDir} />
                </button>

                {/* Last Watched */}
                <button
                  onClick={() => handleColSort('lastWatched')}
                  className={`text-left transition-colors hover:text-foreground ${sortCol === 'lastWatched' ? 'text-primary' : ''}`}
                >
                  Last Watched<SortIcon col="lastWatched" activeCol={sortCol} dir={sortDir} />
                </button>

                {/* Added */}
                <button
                  onClick={() => handleColSort('added')}
                  className={`text-left transition-colors hover:text-foreground ${sortCol === 'added' ? 'text-primary' : ''}`}
                >
                  Added<SortIcon col="added" activeCol={sortCol} dir={sortDir} />
                </button>

                {/* Size */}
                <button
                  onClick={() => handleColSort('size')}
                  className={`text-left transition-colors hover:text-foreground ${sortCol === 'size' ? 'text-primary' : ''}`}
                >
                  Size<SortIcon col="size" activeCol={sortCol} dir={sortDir} />
                </button>

                {/* Status */}
                <button
                  onClick={() => handleColSort('status')}
                  className={`text-left transition-colors hover:text-foreground ${sortCol === 'status' ? 'text-primary' : ''}`}
                >
                  Status<SortIcon col="status" activeCol={sortCol} dir={sortDir} />
                </button>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border">
                {pagedItems.map((item) => {
                  const isExcluded = excluded.has(item.id)
                  const isSelected = selected.has(item.id)
                  const isPermanentlyExcluded = permanentExclusionKeys.has(item.plexRatingKey)
                  const statusRowClass =
                    item.status === 'deleted'
                      ? 'bg-emerald-500/10 border-l-2 border-emerald-500/50'
                      : item.status === 'error'
                        ? 'bg-rose-500/10 border-l-2 border-rose-500/50'
                        : item.status === 'skipped'
                          ? 'bg-muted/30'
                          : ''
                  return (
                    <div
                      key={item.id}
                      className={`grid ${colClass} gap-3 items-center px-4 py-3 transition-colors
                        ${isExcluded ? 'opacity-40' : 'hover:bg-accent/20'}
                        ${statusRowClass}
                        ${isSelected ? 'bg-primary/5' : ''}
                        ${selectMode ? 'cursor-default' : 'cursor-pointer'}
                      `}
                      onClick={() => {
                        if (isExecuting) return
                        if (selectMode) {
                          toggleSelect(item.id)
                        } else {
                          setDetailItem(item)
                        }
                      }}
                    >
                      {/* Checkbox — only in select mode */}
                      {selectMode && (
                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isExecuting}
                            onChange={() => toggleSelect(item.id)}
                            className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer disabled:cursor-not-allowed"
                          />
                        </div>
                      )}

                      {/* Poster */}
                      <PosterImage
                        src={item.posterPath}
                        alt={item.title}
                        mediaType={item.mediaType as 'movie' | 'show'}
                        width={44}
                        height={64}
                      />

                      {/* Title */}
                      <div className="min-w-0">
                        <p className={`font-medium text-sm truncate ${isExcluded ? 'line-through' : ''}`}>
                          {item.title}
                          {isPermanentlyExcluded && (
                            <ShieldBan
                              className="inline h-3 w-3 ml-1.5 text-orange-400 align-middle shrink-0"
                              aria-label="Permanently excluded"
                            />
                          )}
                        </p>
                        {item.year && (
                          <p className="text-xs text-muted-foreground">
                            {item.year} · {item.watchCount}× played
                          </p>
                        )}
                      </div>

                      {/* Reason */}
                      <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                        {item.reasons.map((r) => (
                          <ReasonTag key={r} reason={r} />
                        ))}
                      </div>

                      {/* Last Watched */}
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeDate(item.lastWatchedAt)}
                      </span>

                      {/* Added */}
                      <span className="text-xs text-muted-foreground">{formatDate(item.addedAt)}</span>

                      {/* Size */}
                      <span className="text-xs text-muted-foreground">{formatBytes(item.fileSizeBytes)}</span>

                      {/* Status */}
                      <span
                        className={`text-xs font-medium capitalize ${ITEM_STATUS_STYLES[item.status] ?? ''} ${item.status === 'error' && item.errorMessage ? 'cursor-help underline decoration-dotted' : ''}`}
                        title={item.status === 'error' && item.errorMessage ? item.errorMessage : undefined}
                      >
                        {item.status}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30 text-sm">
                  <span className="text-xs text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedItems.length)} of{' '}
                    {sortedItems.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={page === 0}
                      onClick={() => { setPage((p) => p - 1); setSelected(new Set()) }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={page >= totalPages - 1}
                      onClick={() => { setPage((p) => p + 1); setSelected(new Set()) }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Grid view */
            <div className={cn('grid gap-3', gridCols)}>
              {sortedItems.map((item, idx) => {
                const isExcluded = excluded.has(item.id)
                const isSelected = selected.has(item.id)
                const isPermanentlyExcluded = permanentExclusionKeys.has(item.plexRatingKey)
                const letter = getItemLetter(item.title)
                const isFirstOfLetter = idx === 0 || getItemLetter(sortedItems[idx - 1].title) !== letter
                return (
                  <div
                    key={item.id}
                    className="group cursor-pointer relative"
                    onClick={() => {
                      if (isExecuting) return
                      if (selectMode) toggleSelect(item.id)
                      else setDetailItem(item)
                    }}
                  >
                    {isFirstOfLetter && (
                      <span
                        id={`letter-section-${letter}`}
                        data-letter-section={letter}
                        className="absolute -top-px"
                      />
                    )}
                    <div className={cn(
                      'relative rounded-lg overflow-hidden border aspect-[2/3] bg-muted transition-[border-color,box-shadow]',
                      isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50',
                      isExcluded && 'opacity-50'
                    )}>
                      <PosterImage
                        src={item.posterPath}
                        alt={item.title}
                        mediaType={item.mediaType as 'movie' | 'show'}
                        fill
                        className="absolute inset-0"
                        sizes={gridSizes}
                      />
                      {/* Reason tag pills overlay */}
                      {item.reasons.length > 0 && (
                        <div className="absolute bottom-8 left-2 z-20 flex flex-col items-start gap-1">
                          {item.reasons.slice(0, 2).map((r) => (
                            <ReasonTag key={r} reason={r} />
                          ))}
                        </div>
                      )}
                      {/* Status overlay (non-pending only) */}
                      {item.status !== 'pending' && (
                        <div className={`absolute bottom-0 inset-x-0 py-1 text-center text-[10px] font-semibold capitalize ${
                          item.status === 'deleted' ? 'bg-emerald-500/80 text-white' :
                          item.status === 'error' ? 'bg-rose-500/80 text-white' :
                          'bg-muted/80 text-muted-foreground'
                        }`}>
                          {item.status}
                        </div>
                      )}
                      {/* Permanent exclusion icon */}
                      {isPermanentlyExcluded && (
                        <div className="absolute top-1.5 right-1.5 z-10 rounded bg-black/60 p-0.5">
                          <ShieldBan className="h-3.5 w-3.5 text-orange-400" />
                        </div>
                      )}
                      {/* Checkbox overlay */}
                      <div
                        className={cn(
                          'absolute top-1.5 left-1.5 z-10 transition-opacity',
                          isSelected ? 'opacity-100' : selectMode ? 'opacity-0 group-hover:opacity-100' : 'hidden'
                        )}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(item.id) }}
                      >
                        <div className="rounded bg-black/60 p-0.5">
                          {isSelected
                            ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                            : <Square className="h-3.5 w-3.5 text-white" />}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <p className={cn(
                        'text-[11px] font-medium leading-tight line-clamp-2',
                        isExcluded && 'line-through opacity-50'
                      )}>
                        {item.title}
                      </p>
                      {item.year && <p className="text-[10px] text-muted-foreground mt-0.5">{item.year}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {sortedItems.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {searchQuery
                ? `No items match "${searchQuery}"`
                : filterActiveCount > 0
                  ? 'No items match your filters'
                  : 'No items'}
            </div>
          )}
        </div>{/* end scrollable content */}

        {/* Letter strip — right sidebar, grid mode only */}
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
