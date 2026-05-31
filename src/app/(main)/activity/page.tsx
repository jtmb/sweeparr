'use client'

import { useEffect, useRef, useState } from 'react'
import React from 'react'
import Link from 'next/link'
import { RefreshCw, PlayCircle, ChevronLeft, ChevronRight, Library, FileText, Trash2, HardDrive, AlertTriangle, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PosterImage from '@/components/media/PosterImage'
import type { PlexSession } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { formatBytes } from '@/lib/utils'
import MediaDetailPanel from '@/components/media/MediaDetailPanel'
import type { MediaDetailItem } from '@/components/media/MediaDetailPanel'

interface WatchedItem {
  title: string
  posterUrl: string | null
  watchCount: number
  year?: number
}

interface RecentItem {
  plexRatingKey?: string
  title: string
  posterUrl: string | null
  watchedAt?: string
  addedAt?: string
  mediaType: string
  year?: number
}

interface LibraryStat {
  key: string
  title: string
  type: string
  itemCount: number
  playCount: number
}

interface ReportItem {
  id: string
  generatedAt: string
  executedAt?: string | null
  status: string
  totalItems: number
  totalSizeBytes: number
  removedItems: number
  clearedBytes: number
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-muted-foreground',
  READY: 'text-amber-400',
  EXECUTING: 'text-blue-400',
  COMPLETED: 'text-emerald-400',
  FAILED: 'text-rose-400',
}

interface ActiveUser {
  userName: string
  playCount: number
}

interface StatsData {
  mostWatchedMovies: WatchedItem[]
  mostWatchedShows: WatchedItem[]
  mostActiveLibraries: LibraryStat[]
  mostActiveUsers: ActiveUser[]
  recentlyWatched: RecentItem[]
  recentlyAdded: RecentItem[]
  libraryList: LibraryStat[]
}

interface ActivityData {
  sessions: PlexSession[]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  title,
  accent,
  topPosterUrl,
  topPosterAlt,
  rows,
  metric,
}: {
  title: string
  accent: string
  topPosterUrl?: string | null
  topPosterAlt?: string
  rows: Array<{ label: string; value: number | string; sub?: string }>
  metric?: string
}) {
  const bgPosterSrc = topPosterUrl ? `/api/images/plex?url=${encodeURIComponent(topPosterUrl)}` : null

  return (
    <div className="rounded-lg overflow-hidden border border-border bg-card flex flex-col relative">
      {/* Faded poster background */}
      {bgPosterSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgPosterSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-10 pointer-events-none select-none"
        />
      )}
      <div className={`relative z-10 px-3 py-2 ${accent} flex items-center justify-between`}>
        <span className="text-[10px] font-bold tracking-widest uppercase text-white/90">{title}</span>
        {metric && <span className="text-[10px] font-semibold tracking-widest uppercase text-white/60">{metric}</span>}
      </div>
      <div className="relative z-10 flex flex-1">
        {topPosterUrl !== undefined && (
          <div className="w-16 shrink-0 self-stretch relative">
            <PosterImage
              src={topPosterUrl ?? undefined}
              alt={topPosterAlt ?? ''}
              fill
              className="absolute inset-0"
            />
          </div>
        )}
        <div className="flex-1 divide-y divide-border">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">No data</p>
          ) : (
            rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate leading-tight">{row.label}</p>
                  {row.sub && <p className="text-[10px] text-muted-foreground truncate">{row.sub}</p>}
                </div>
                <span className="text-xs font-semibold text-muted-foreground shrink-0">{row.value}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function HorizontalScroll({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasScrolled, setHasScrolled] = useState(false)
  const [fadeRight, setFadeRight] = useState(true)

  const updateFades = () => {
    const el = scrollRef.current
    if (!el) return
    setHasScrolled(el.scrollLeft > 8)
    setFadeRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }

  const scrollCallbackRef = (el: HTMLDivElement | null) => {
    ;(scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    if (el) {
      el.addEventListener('scroll', updateFades, { passive: true })
      updateFades()
    }
  }

  const scroll = (dir: 'left' | 'right') => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: dir === 'left' ? -400 : 400, behavior: 'smooth' })
  }

  return (
    <div className="flex items-center gap-3">
      {hasScrolled && (
        <button
          onClick={() => scroll('left')}
          className="shrink-0 opacity-30 hover:opacity-90 transition-opacity"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div className="relative flex-1 min-w-0">
        <div ref={scrollCallbackRef} className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-4 pb-1 w-max">{children}</div>
        </div>
        <div
          className="absolute inset-y-0 left-0 w-16 pointer-events-none transition-opacity duration-200"
          style={{ background: 'linear-gradient(to right, hsl(var(--background)), transparent)', opacity: hasScrolled ? 1 : 0, transition: 'opacity 200ms' }}
        />
        <div
          className="absolute inset-y-0 right-0 w-16 pointer-events-none transition-opacity duration-200"
          style={{ background: 'linear-gradient(to left, hsl(var(--background)), transparent)', opacity: fadeRight ? 1 : 0 }}
        />
      </div>
      <button
        onClick={() => scroll('right')}
        className="shrink-0 opacity-30 hover:opacity-90 disabled:opacity-10 transition-opacity"
        aria-label="Scroll right"
        disabled={!fadeRight}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}

// ─── Session helpers ──────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtEta(viewOffset: number, duration: number): string {
  const remaining = Math.max(0, duration - viewOffset)
  return fmtMs(remaining)
}

function decisionLabel(d?: string): string {
  if (!d || d === 'directplay') return 'Direct Play'
  if (d === 'copy') return 'Direct Stream'
  if (d === 'transcode') return 'Transcode'
  return d
}

function PlatformBadge({ platform }: { platform?: string }) {
  const p = (platform ?? '').toLowerCase()

  // Chrome
  if (p.includes('chrome') && !p.includes('chromium') && !p.includes('chromecast')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-yellow-500/10 border border-yellow-500/20" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 10.909a1.091 1.091 0 1 1 0 2.182 1.091 1.091 0 0 1 0-2.182z" opacity=".3"/>
        <path d="M12 6.545a5.454 5.454 0 0 0-5.415 4.804L2.632 4.501A12 12 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.668-6.355A5.454 5.454 0 0 1 12 17.455a5.454 5.454 0 0 1-5.454-5.455A5.454 5.454 0 0 1 12 6.545z" fill="#4285F4"/>
        <path d="M12 6.545h10.691a12 12 0 0 0-10.69-6.544 12 12 0 0 0-9.37 4.5l3.954 6.849A5.454 5.454 0 0 1 12 6.545z" fill="#EA4335"/>
        <path d="M12 17.455a5.454 5.454 0 0 1-4.797-2.855l-3.953 6.847A11.966 11.966 0 0 0 12 24a12 12 0 0 0 9.37-4.5l-3.953-6.848a5.454 5.454 0 0 1-5.417 4.803z" fill="#34A853"/>
        <path d="M17.454 12a5.446 5.446 0 0 0-1.452-3.709l3.953-6.847a12 12 0 0 1 2.736 7.012A5.454 5.454 0 0 0 17.454 12z" fill="#FBBC05"/>
        <circle cx="12" cy="12" r="3.273" fill="white"/>
      </svg>
    </span>
  )

  // Chromium
  if (p.includes('chromium')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-sky-500/10 border border-sky-500/20" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-300" fill="currentColor" aria-hidden>
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4a8 8 0 110 16A8 8 0 0112 4zm0 3a5 5 0 100 10A5 5 0 0012 7zm0 2a3 3 0 110 6 3 3 0 010-6z"/>
      </svg>
    </span>
  )

  // Firefox
  if (p.includes('firefox')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-orange-500/10 border border-orange-500/20" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-orange-400" fill="currentColor" aria-hidden>
        <path d="M23.5 12.2C23.5 5.8 18.2.5 11.8.5.5 4.7.5 12.2.5 12.2c0 6.2 5.1 11.3 11.3 11.3 6.3 0 11.4-5.1 11.7-11.3zM12 21.1C6.9 21.1 2.8 17 2.8 11.9c0-.8.1-1.6.3-2.3.8 1.1 2 1.8 3.4 1.8.1 0 .3 0 .4-.1-.4.7-.6 1.5-.6 2.3 0 3.1 2.2 5.7 5.2 6.2-.3-.5-.5-1.1-.5-1.7 0-.5.1-1 .3-1.4l.9-1.6c.3-.5.4-1 .4-1.6 0-1.3-.8-2.4-1.9-2.9l-.2-.1c-.8-.4-1.3-1.2-1.3-2.1 0-.5.1-1 .4-1.4 1-.9 2.3-1.5 3.7-1.6-.1.3-.2.7-.2 1 0 1.4.8 2.6 1.9 3.2l.1.1c.5.3.9.8 1 1.3.6-.6 1-1.4 1-2.3 0-.4-.1-.9-.2-1.3 1.3.8 2.3 2 2.8 3.5.2.6.3 1.2.3 1.8 0 3.6-2.9 6.5-6.5 6.5z"/>
      </svg>
    </span>
  )

  // Safari
  if (p.includes('safari')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-sky-500/10 border border-sky-500/20" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-300" fill="currentColor" aria-hidden>
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm.929 4.071l-4.286 8.571 8.572-4.285-4.286-4.286zm-1.858 1.858l4.286 4.286-8.572 4.285 4.286-8.571z"/>
      </svg>
    </span>
  )

  // Edge
  if (p.includes('edge')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-blue-500/10 border border-blue-500/20" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-300" fill="currentColor" aria-hidden>
        <path d="M21.86 17.86c-.35.19-.74.33-1.14.42a9.4 9.4 0 01-2.14.24 9.56 9.56 0 01-3.59-.67 7.51 7.51 0 01-2.72-1.87 7.3 7.3 0 01-1.61-2.86H19a4.77 4.77 0 00.32-1.74c0-1.15-.27-2.2-.81-3.13a6.02 6.02 0 00-2.2-2.16A6.15 6.15 0 0013.2 5a9.6 9.6 0 00-3.58.66A8.97 8.97 0 006.77 7.7a9.34 9.34 0 00-1.94 3.29A11.8 11.8 0 004.37 15c0 1.65.29 3.15.87 4.51a10.48 10.48 0 002.44 3.55A11 11 0 0011.4 25a12.4 12.4 0 004.65.85c.9 0 1.77-.09 2.61-.28a11.3 11.3 0 002.37-.81l.83-2.9zM13.2 7a4.14 4.14 0 013.3 1.43 5.04 5.04 0 011.22 3.44H9.87A6.25 6.25 0 0111.12 9a4.33 4.33 0 012.08-2z"/>
      </svg>
    </span>
  )

  // Chromecast
  if (p.includes('chromecast')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-red-500/10 border border-red-500/20" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-red-400" fill="currentColor" aria-hidden>
        <path d="M2 16.1A5 5 0 015.9 20H2v-3.9zM2 12.05A9 9 0 019.95 20H8a7 7 0 00-6-6.09v-1.96zM2 8A13 13 0 0113.95 20H12A11 11 0 002 9.95V8zm10-6a16 16 0 0116 16h-2a14 14 0 00-14-14V2zM2 2v4A16 16 0 0118 22h4A18 18 0 002 2z"/>
      </svg>
    </span>
  )

  // Windows logo (4 coloured panes)
  if (p.includes('windows')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-blue-500/15 border border-blue-500/30" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-300" fill="currentColor" aria-hidden>
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
      </svg>
    </span>
  )

  // Apple logo
  if (p.includes('mac') || p.includes('osx') || p.includes('darwin') || p.includes('ios') || p.includes('apple') || p.includes('tvos')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-zinc-500/15 border border-zinc-500/30" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-300" fill="currentColor" aria-hidden>
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
      </svg>
    </span>
  )

  // Android logo
  if (p.includes('android')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-green-500/15 border border-green-500/30" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-green-400" fill="currentColor" aria-hidden>
        <path d="M17.523 15.341a.5.5 0 01-.5.5H6.977a.5.5 0 01-.5-.5V9.5h11.046zM7.5 18.5a1 1 0 001 1h.5v2a1 1 0 002 0v-2h2v2a1 1 0 002 0v-2h.5a1 1 0 001-1v-1.5H7.5zM5 9.5a1 1 0 00-1 1v4a1 1 0 002 0v-4a1 1 0 00-1-1zm14 0a1 1 0 00-1 1v4a1 1 0 002 0v-4a1 1 0 00-1-1zM8.5 4.15l-.9-1.56a.25.25 0 01.433-.25l.92 1.594A5.97 5.97 0 0112 3.5c1.04 0 2.015.265 2.857.734l.92-1.594a.25.25 0 01.433.25L15.3 4.45A5.987 5.987 0 0118 9H6a5.987 5.987 0 012.5-4.85zM10.5 7a.5.5 0 100-1 .5.5 0 000 1zm3.5 0a.5.5 0 100-1 .5.5 0 000 1z"/>
      </svg>
    </span>
  )

  // Linux
  if (p.includes('linux')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-yellow-500/15 border border-yellow-500/30" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-yellow-300" fill="currentColor" aria-hidden>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 6.628 5.373 12 12 12s12-5.372 12-12C24 5.373 18.627 0 12 0zm-.35 4.18c.98-.02 1.85.56 2.5 1.27.62.68.97 1.61.88 2.56-.1 1.1-.7 2.07-1.58 2.67-.38.27-.8.45-1.25.52a3.36 3.36 0 01-1.36-.1 3.27 3.27 0 01-1.82-1.56 3.5 3.5 0 01-.32-2.3c.26-1.3 1.16-2.3 2.35-2.86.19-.09.4-.16.6-.2zm-3.3 9.08c.24-.1.5-.06.72.05.42.23.58.74.38 1.16-.22.44-.74.62-1.18.42a.87.87 0 01-.44-1.14c.1-.22.28-.4.52-.49zm7.3 0c.24.09.42.27.52.49a.87.87 0 01-.44 1.14c-.44.2-.96.02-1.18-.42-.2-.42-.04-.93.38-1.16.22-.11.48-.15.72-.05zm-3.7 1.32c1.37 0 2.56.6 3.36 1.55a8.9 8.9 0 011.52 3.3c.1.38-.07.79-.42.96-.36.17-.78.04-.98-.3a7.2 7.2 0 00-1.22-2.68 2.9 2.9 0 00-2.26-1.1c-.9 0-1.7.4-2.26 1.1a7.2 7.2 0 00-1.22 2.68c-.2.34-.62.47-.98.3-.35-.17-.52-.58-.42-.96a8.9 8.9 0 011.52-3.3c.8-.95 1.99-1.55 3.36-1.55z"/>
      </svg>
    </span>
  )

  // Roku
  if (p.includes('roku')) return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-purple-500/15 border border-purple-500/30" title={platform}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-purple-300" fill="currentColor" aria-hidden>
        <path d="M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm6 4a6 6 0 100 12A6 6 0 0012 6zm0 2a4 4 0 110 8 4 4 0 010-8zm0 2a2 2 0 100 4 2 2 0 000-4z"/>
      </svg>
    </span>
  )

  // Fallback: first 3 chars
  const label = (platform ?? '').slice(0, 3).toUpperCase() || '?'
  return (
    <span className="inline-flex items-center justify-center h-7 min-w-7 rounded bg-muted border border-border px-1.5 text-[10px] font-bold tracking-wider text-muted-foreground" title={platform}>
      {label}
    </span>
  )
}

function SessionCard({ session, onStop }: { session: PlexSession; onStop?: (sessionId: string) => void }) {
  const [stopping, setStopping] = useState(false)
  const [stopped, setStopped] = useState(false)

  const handleStop = async () => {
    const sid = session.Session?.id
    if (!sid || stopping || stopped) return
    setStopping(true)
    try {
      await fetch('/api/plex/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      })
      setStopped(true)
      onStop?.(sid)
    } finally {
      setStopping(false)
    }
  }
  const tc = session.TranscodeSession
  const overallDecision = tc ? decisionLabel(tc.videoDecision) : 'Direct Play'

  const bandwidth = session.Session?.bandwidth
  const bwMbps = bandwidth ? (bandwidth / 1000).toFixed(1) : null

  const pct = session.viewOffset && session.duration
    ? Math.round((session.viewOffset / session.duration) * 100) : 0

  const posterSrc = session.type === 'episode' && session.grandparentThumb
    ? session.grandparentThumb : session.thumb

  const userThumb = session.User?.thumb
    ? `/api/images/plex?url=${encodeURIComponent(session.User.thumb)}` : null

  const showTitle = session.type === 'episode' ? session.grandparentTitle : session.title
  const epInfo = session.type === 'episode'
    ? `S${session.parentIndex} · E${session.index}`
    : session.year ? String(session.year) : null

  const bgSrc = posterSrc ? `/api/images/plex?url=${encodeURIComponent(posterSrc)}` : null

  return (
    <div className="rounded-lg border border-blue-500/20 overflow-hidden flex relative w-72 shrink-0">
      {/* Faded poster background */}
      {bgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-10 pointer-events-none select-none"
        />
      )}
      <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />
      {/* Poster */}
      <div className="w-[72px] shrink-0 relative bg-muted self-stretch z-10">
        <PosterImage
          src={posterSrc}
          alt={showTitle ?? session.title}
          fill
          className="absolute inset-0 object-cover"
          mediaType={session.type === 'episode' ? 'show' : 'movie'}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col p-3 gap-2 relative z-10">
        {/* Title + platform */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold leading-tight truncate">{showTitle}</p>
            {epInfo && <p className="text-[11px] text-muted-foreground mt-0.5">{epInfo}</p>}
          </div>
          <PlatformBadge platform={session.Player?.platform} />
        </div>

        {/* Stream chips */}
        <div className="flex flex-wrap gap-1">
          <span className="inline-flex items-center rounded bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300/80 font-medium">
            {overallDecision}
          </span>
          {bwMbps && (
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
              {bwMbps} Mbps
            </span>
          )}
        </div>

        {/* Progress */}
        {session.viewOffset != null && session.duration != null && (
          <div className="space-y-1">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-1 bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>{fmtMs(session.viewOffset)} / {fmtMs(session.duration)}</span>
              <span>ETA: {fmtEta(session.viewOffset, session.duration)}</span>
            </div>
          </div>
        )}

        {/* User + stop */}
        <div className="flex items-center justify-between gap-2 mt-auto">
          {session.User && (
            <div className="flex items-center gap-1.5 min-w-0">
              {userThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userThumb} alt={session.User.title} className="h-5 w-5 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                  {session.User.title[0].toUpperCase()}
                </div>
              )}
              <span className="text-[11px] text-muted-foreground truncate">{session.User.title}</span>
            </div>
          )}
          {session.Session?.id && (
            <button
              onClick={handleStop}
              disabled={stopping || stopped}
              title={stopped ? 'Stream stopped' : 'Stop stream'}
              className={`flex items-center justify-center h-6 w-6 rounded transition-colors shrink-0 ${stopped ? 'text-muted-foreground/30 cursor-default' : 'text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10'}`}
            >
              <Square className={`h-3 w-3 ${stopping ? 'animate-pulse' : ''}`} fill="currentColor" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CollapsibleSection({
  id,
  title,
  children,
  defaultOpen = true,
  badge,
  icon,
}: {
  id: string
  title: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: React.ReactNode
  icon?: React.ReactNode
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen
    try {
      const stored = localStorage.getItem(`activity-section-${id}`)
      return stored === null ? defaultOpen : stored === 'true'
    } catch {
      return defaultOpen
    }
  })

  const toggle = () => {
    setOpen((v) => {
      const next = !v
      try { localStorage.setItem(`activity-section-${id}`, String(next)) } catch {}
      return next
    })
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full mb-4 group cursor-pointer"
      >
        <ChevronRight
          className={`h-3 w-3 text-muted-foreground/50 transition-transform duration-200 shrink-0 ${open ? 'rotate-90' : ''}`}
        />
        {icon && <span className="shrink-0">{icon}</span>}
        <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground group-hover:text-foreground/80 transition-colors whitespace-nowrap">
          {title}
        </h2>
        {badge && <span className="shrink-0">{badge}</span>}
        <div className="flex-1 h-px bg-border" />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Module-level cache (survives re-renders and page navigations) ────────────

const STATS_TTL = 5 * 60 * 1000 // 5 minutes
const SESSIONS_TTL = 30 * 1000  // 30 seconds

const _cache: {
  stats: StatsData | null
  statsFetchedAt: number
  sessions: PlexSession[]
  sessionsFetchedAt: number
} = { stats: null, statsFetchedAt: 0, sessions: [], sessionsFetchedAt: 0 }

// ─── Main page ────────────────────────────────────────────────────────────────

const _reportsCache: { data: ReportItem[] | null; fetchedAt: number } = { data: null, fetchedAt: 0 }
const REPORTS_TTL = 60 * 1000

export default function ActivityPage() {
  const [activity, setActivity] = useState<ActivityData>({ sessions: _cache.sessions })
  const [stats, setStats] = useState<StatsData | null>(_cache.stats)
  const [reports, setReports] = useState<ReportItem[]>(_reportsCache.data ?? [])
  const [detailItem, setDetailItem] = useState<MediaDetailItem | null>(null)
  // Only show loading spinner on first load when there's nothing cached
  const [loading, setLoading] = useState(_cache.stats === null)
  const [statsAge, setStatsAge] = useState<number>(_cache.statsFetchedAt)

  const fetchSessions = async () => {
    const now = Date.now()
    if (now - _cache.sessionsFetchedAt < SESSIONS_TTL) return
    try {
      const res = await fetch('/api/plex/activity')
      if (res.ok) {
        const data: ActivityData = await res.json()
        _cache.sessions = data.sessions
        _cache.sessionsFetchedAt = Date.now()
        setActivity(data)
      }
    } catch {
      // non-fatal
    }
  }

  const fetchStats = async () => {
    const now = Date.now()
    if (now - _cache.statsFetchedAt < STATS_TTL) return
    try {
      const res = await fetch('/api/plex/stats')
      if (res.ok) {
        const data: StatsData = await res.json()
        _cache.stats = data
        _cache.statsFetchedAt = Date.now()
        setStats(data)
        setStatsAge(Date.now())
      }
    } catch {
      // non-fatal
    }
  }

  const fetchReports = async () => {
    const now = Date.now()
    if (now - _reportsCache.fetchedAt < REPORTS_TTL) return
    try {
      const res = await fetch('/api/reports')
      if (res.ok) {
        const data: ReportItem[] = await res.json()
        _reportsCache.data = data
        _reportsCache.fetchedAt = Date.now()
        setReports(data)
      }
    } catch {
      // non-fatal — reports section simply stays empty
    }
  }

  const load = async (force = false) => {
    if (force) {
      _cache.statsFetchedAt = 0
      _cache.sessionsFetchedAt = 0
      _reportsCache.fetchedAt = 0
    }
    setLoading(_cache.stats === null)
    await Promise.all([fetchSessions(), fetchStats(), fetchReports()])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(fetchSessions, SESSIONS_TTL)
    return () => clearInterval(interval)
  }, [])

  const sessions = activity.sessions ?? []
  const recentReports = reports.slice(0, 5)
  const pendingReport = reports.find((r) => r.status === 'READY')
  const totalCandidates = pendingReport?.totalItems ?? 0
  const candidateSize = pendingReport ? pendingReport.totalSizeBytes : 0
  const libraries = stats?.libraryList ?? []



  return (
    <>
    <MediaDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
    <Tabs defaultValue="now-playing" className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-2xl font-bold shrink-0">Activity</h1>
          <TabsList className="bg-transparent p-0 gap-1 h-auto border-0">
            <TabsTrigger
              value="now-playing"
              className="flex items-center gap-1.5 bg-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-md border border-transparent data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:border-transparent shadow-none"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Now Playing
              {sessions.length > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded px-1 text-[11px] font-bold bg-blue-500/20 text-blue-400 tabular-nums">
                  {sessions.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="overview"
              className="bg-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-md border border-transparent data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:border-transparent shadow-none"
            >
              Overview
            </TabsTrigger>
          </TabsList>
          {statsAge > 0 && (
            <span className="text-xs text-muted-foreground/60 hidden sm:block">
              updated {formatDistanceToNow(new Date(statsAge), { addSuffix: true })}
            </span>
          )}
        </div>
        <button
          onClick={() => { load(true) }}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div>

          {/* Now Playing tab */}
          <TabsContent value="now-playing">
            <div className="space-y-8">
              {/* Session cards */}
              {sessions.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-12 text-center">
                  <PlayCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No active Plex sessions</p>
                </div>
              ) : (
                <HorizontalScroll>
                  {sessions.map((session, i) => (
                    <SessionCard
                      key={session.Session?.id ?? `${session.ratingKey}-${i}`}
                      session={session}
                      onStop={() => { _cache.sessionsFetchedAt = 0; fetchSessions() }}
                    />
                  ))}
                </HorizontalScroll>
              )}

              {/* Watch Statistics */}
              <CollapsibleSection id="watch-statistics" title="Watch Statistics">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
                  <StatCard title="Most Watched Movies" accent="bg-orange-600/80" metric="Plays"
                    topPosterUrl={stats?.mostWatchedMovies[0]?.posterUrl} topPosterAlt={stats?.mostWatchedMovies[0]?.title}
                    rows={(stats?.mostWatchedMovies ?? []).map((m) => ({ label: m.title, sub: m.year?.toString(), value: m.watchCount }))} />
                  <StatCard title="Most Watched TV Shows" accent="bg-teal-700/80" metric="Plays"
                    topPosterUrl={stats?.mostWatchedShows[0]?.posterUrl} topPosterAlt={stats?.mostWatchedShows[0]?.title}
                    rows={(stats?.mostWatchedShows ?? []).map((s) => ({ label: s.title, sub: s.year?.toString(), value: s.watchCount }))} />
                  <StatCard title="Recently Watched" accent="bg-violet-700/80" metric="When"
                    topPosterUrl={stats?.recentlyWatched[0]?.posterUrl} topPosterAlt={stats?.recentlyWatched[0]?.title}
                    rows={(stats?.recentlyWatched ?? []).slice(0, 5).map((m) => ({
                      label: m.title, sub: m.year?.toString(),
                      value: m.watchedAt ? formatDistanceToNow(new Date(m.watchedAt), { addSuffix: true }).replace('about ', '').replace(' ago', '') : '',
                    }))} />
                  <StatCard title="Most Active Libraries" accent="bg-sky-700/80" metric="Plays"
                    rows={(stats?.mostActiveLibraries ?? []).map((l) => ({ label: l.title, sub: `${l.itemCount.toLocaleString()} items`, value: l.playCount }))} />
                  <StatCard title="Most Active Users" accent="bg-pink-700/80" metric="Plays"
                    rows={(stats?.mostActiveUsers ?? []).map((u) => ({ label: u.userName, value: u.playCount }))} />
                </div>
              </CollapsibleSection>

              {/* Library Statistics */}
              {stats && stats.libraryList.length > 0 && (
                <CollapsibleSection id="library-statistics" title="Library Statistics">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stats.libraryList.map((lib) => (
                      <div key={lib.title} className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-1">
                            {lib.type === 'movie' ? 'Movies' : lib.type === 'show' ? 'TV Shows' : lib.type}
                          </p>
                          <p className="font-semibold text-foreground">{lib.title}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold tabular-nums">{lib.itemCount.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {lib.type === 'movie' ? 'movies' : lib.type === 'show' ? 'shows' : 'items'}
                          </p>
                          {lib.playCount > 0 && <p className="text-[10px] text-muted-foreground">{lib.playCount.toLocaleString()} plays</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {/* Recently Added */}
              {stats && stats.recentlyAdded.length > 0 && (
                <CollapsibleSection id="recently-added" title="Recently Added">
                  <HorizontalScroll>
                    {stats.recentlyAdded.map((item, i) => (
                      <div
                        key={`${item.title}-${i}`}
                        className="w-36 shrink-0 cursor-pointer"
                        onClick={() => item.plexRatingKey && setDetailItem({ plexRatingKey: item.plexRatingKey, title: item.title, year: item.year, mediaType: item.mediaType, posterPath: item.posterUrl ?? null, addedAt: item.addedAt })}
                      >
                        <div className="rounded-lg overflow-hidden border border-border aspect-[2/3] bg-muted relative">
                          <PosterImage src={item.posterUrl ?? undefined} alt={item.title} fill className="absolute inset-0" mediaType={item.mediaType as 'movie' | 'show'} />
                        </div>
                        <div className="mt-1.5">
                          <p className="text-[11px] font-medium leading-tight line-clamp-2">{item.title}</p>
                          {item.addedAt && <p className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(item.addedAt), { addSuffix: true })}</p>}
                        </div>
                      </div>
                    ))}
                  </HorizontalScroll>
                </CollapsibleSection>
              )}

              {/* No data state */}
              {!loading && !stats && (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                  <p className="text-muted-foreground text-sm">No library data available. Scan a library first.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Overview tab */}
          <TabsContent value="overview">
            <CollapsibleSection id="overview" title="Overview">
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Libraries</CardTitle>
                    <Library className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{libraries.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {libraries.filter((l) => l.type === 'movie').length} movies ·{' '}
                      {libraries.filter((l) => l.type === 'show').length} shows
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Now Playing</CardTitle>
                    <PlayCircle className="h-4 w-4 text-blue-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-400">{sessions.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">Active Plex sessions</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Candidates</CardTitle>
                    <Trash2 className="h-4 w-4 text-orange-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-400">{totalCandidates}</div>
                    <p className="text-xs text-muted-foreground mt-1">Items eligible for removal</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Space Freeable</CardTitle>
                    <HardDrive className="h-4 w-4 text-emerald-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-400">{formatBytes(candidateSize)}</div>
                    <p className="text-xs text-muted-foreground mt-1">From latest report</p>
                  </CardContent>
                </Card>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Libraries</CardTitle>
                    <Link href="/libraries"><Button size="sm" variant="ghost">View all</Button></Link>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {libraries.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No libraries found</p>
                    ) : libraries.map((lib) => (
                      <Link key={lib.key} href={`/libraries/${lib.key}`}>
                        <div className="flex items-center gap-3 rounded-md p-2 hover:bg-accent transition-colors cursor-pointer">
                          <Library className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm font-medium">{lib.title}</span>
                          <span className="ml-auto text-xs text-muted-foreground capitalize">{lib.type}</span>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Recent Reports</CardTitle>
                    <Link href="/reports"><Button size="sm" variant="ghost">View all</Button></Link>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {recentReports.length === 0 ? (
                      <div className="py-4 text-center">
                        <p className="text-sm text-muted-foreground">No reports generated yet</p>
                        <Link href="/reports"><Button size="sm" className="mt-3">Generate Report</Button></Link>
                      </div>
                    ) : recentReports.map((report) => (
                      <Link key={report.id} href={`/reports/${report.id}`}>
                        <div className="flex items-center gap-3 rounded-md p-2 hover:bg-accent transition-colors cursor-pointer">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{report.totalItems} items · {formatBytes(report.totalSizeBytes)}</p>
                            {report.status === 'COMPLETED' && (
                              <p className="text-xs text-emerald-400">
                                Removed {report.removedItems} item{report.removedItems === 1 ? '' : 's'} · Cleared {formatBytes(report.clearedBytes)}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {new Date(report.generatedAt).toLocaleDateString()}
                              {report.executedAt ? ` · Executed ${new Date(report.executedAt).toLocaleDateString()}` : ''}
                            </p>
                          </div>
                          <span className={`text-xs font-medium ${STATUS_COLORS[report.status] ?? 'text-muted-foreground'}`}>
                            {report.status}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </CollapsibleSection>
          </TabsContent>

      </div>
    </Tabs>
    </>
  )
}