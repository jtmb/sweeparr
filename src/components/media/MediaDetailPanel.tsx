'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Star, Clock, Calendar, Eye, Shield, Tv, Film, Maximize2, Minimize2 } from 'lucide-react'
import type { PlexItemDetail } from '@/app/api/plex/item/[ratingKey]/route'
import ReasonTag from '@/components/media/ReasonTag'
import { formatBytes, formatRelativeDate, formatDate } from '@/lib/utils'

// Generic interface — works for ReportItemRow, EnrichedMediaItem, PermanentExclusion, etc.
export interface MediaDetailItem {
  plexRatingKey: string
  title: string
  year?: number | null
  mediaType: string
  posterPath?: string | null
  // optional contextual extras
  reasons?: string[]
  fileSizeBytes?: number
  lastWatchedAt?: string | Date | null
  watchCount?: number
  addedAt?: string | Date | null
  status?: string
  ruleName?: string | null
  errorMessage?: string | null
}

function proxyUrl(path?: string | null) {
  if (!path) return null
  return `/api/images/plex?url=${encodeURIComponent(path)}`
}

function fmtDuration(ms?: number) {
  if (!ms) return null
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function RatingBadge({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold ${className}`}>
      <Star className="h-3 w-3" fill="currentColor" />
      {value.toFixed(1)}
      <span className="font-normal opacity-70">{label}</span>
    </span>
  )
}

interface Props {
  item: MediaDetailItem | null
  onClose: () => void
}

export default function MediaDetailPanel({ item, onClose }: Props) {
  const [detail, setDetail] = useState<PlexItemDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Fetch Plex metadata whenever item changes
  useEffect(() => {
    if (!item) { setDetail(null); return }
    setDetail(null)
    setLoading(true)
    fetch(`/api/plex/item/${item.plexRatingKey}`)
      .then((r) => r.json())
      .then((d: PlexItemDetail & { error?: string }) => {
        if (!d.error) setDetail(d)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [item])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!item) return null

  const posterUrl = proxyUrl(item.posterPath)
  const artUrl = proxyUrl(detail?.art)
  const thumbUrl = proxyUrl(detail?.thumb ?? item.posterPath)

  const genres = detail?.Genre?.map((g) => g.tag) ?? []
  const directors = detail?.Director?.map((d) => d.tag) ?? []
  const writers = detail?.Writer?.map((w) => w.tag) ?? []
  const cast = detail?.Role?.slice(0, 20) ?? []

  return (
    <>
      {/* Backdrop overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — slides in from the right, or fills screen when maximized */}
      <div
        className={maximized
          ? 'fixed inset-0 z-50 flex flex-col overflow-hidden shadow-2xl bg-background'
          : 'fixed right-0 top-0 bottom-0 z-50 w-full max-w-3xl flex flex-col overflow-hidden shadow-2xl border-l border-border bg-background'}
        style={{ zoom: 1.136 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero / backdrop */}
        <div className="relative h-56 shrink-0 overflow-hidden bg-muted">
          {artUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-top opacity-40"
            />
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />

          {/* Close + maximize buttons */}
          <div className="absolute top-4 right-4 flex items-center gap-1.5 z-10">
            <button
              onClick={() => setMaximized((v) => !v)}
              className="rounded-full bg-background/80 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="rounded-full bg-background/80 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Poster + title block */}
          <div className="absolute bottom-4 left-4 right-16 flex items-end gap-4 z-10">
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl ?? posterUrl}
                alt={item.title}
                className="w-24 rounded-md shadow-xl border border-border/40 shrink-0 object-cover"
                style={{ aspectRatio: '2/3' }}
              />
            ) : (
              <div className="w-24 rounded-md bg-muted border border-border flex items-center justify-center shrink-0" style={{ aspectRatio: '2/3' }}>
                {item.mediaType === 'show'
                  ? <Tv className="h-8 w-8 text-muted-foreground" />
                  : <Film className="h-8 w-8 text-muted-foreground" />}
              </div>
            )}
            <div className="min-w-0 pb-1">
              <h2 className="text-xl font-bold leading-tight truncate">{item.title}</h2>
              <div className="flex items-center flex-wrap gap-2 mt-1">
                {item.year && <span className="text-sm text-muted-foreground">{item.year}</span>}
                {detail?.contentRating && (
                  <span className="text-xs border border-border/60 px-1.5 py-0.5 rounded text-muted-foreground">{detail.contentRating}</span>
                )}
                {detail?.duration && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDuration(detail.duration)}
                  </span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${item.mediaType === 'show' ? 'bg-teal-500/20 text-teal-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {item.mediaType}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {detail?.audienceRating != null && (
                  <RatingBadge value={detail.audienceRating} label="audience" className="bg-amber-500/20 text-amber-400" />
                )}
                {detail?.rating != null && (
                  <RatingBadge value={detail.rating} label="critics" className="bg-rose-500/20 text-rose-400" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Summary */}
            {detail?.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{detail.summary}</p>
            )}
            {detail?.tagline && (
              <p className="text-xs italic text-muted-foreground/70">"{detail.tagline}"</p>
            )}

            {loading && !detail && (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-border pt-4">

              {/* Cleanup candidate info — only show if present */}
              {item.reasons && item.reasons.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Cleanup Reasons</p>
                  <div className="flex flex-wrap gap-1">
                    {item.reasons.map((r) => <ReasonTag key={r} reason={r} />)}
                  </div>
                </div>
              )}

              {item.fileSizeBytes != null && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Size on Disk</p>
                  <p className="font-medium">{formatBytes(item.fileSizeBytes)}</p>
                </div>
              )}

              {item.lastWatchedAt != null && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Last Watched</p>
                  <p className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatRelativeDate(item.lastWatchedAt)}
                  </p>
                </div>
              )}

              {item.watchCount != null && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Play Count</p>
                  <p>{item.watchCount}×</p>
                </div>
              )}

              {item.addedAt != null && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Added</p>
                  <p className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDate(item.addedAt)}
                  </p>
                </div>
              )}

              {item.status != null && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Status</p>
                <p className={`capitalize font-medium ${
                  item.status === 'deleted' ? 'text-emerald-400'
                    : item.status === 'error' ? 'text-rose-400'
                    : item.status === 'skipped' ? 'text-muted-foreground'
                    : 'text-amber-400'
                }`}>{item.status}</p>
              </div>
              )}

              {item.ruleName && (
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Matched Rule</p>
                  <p className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    {item.ruleName}
                  </p>
                </div>
              )}

              {/* Plex metadata */}
              {genres.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-1">Genres</p>
                  <div className="flex flex-wrap gap-1.5">
                    {genres.map((g) => (
                      <span key={g} className="text-xs bg-muted border border-border rounded px-2 py-0.5">{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {detail?.studio && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Studio</p>
                  <p>{detail.studio}</p>
                </div>
              )}

              {directors.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Director</p>
                  <p>{directors.join(', ')}</p>
                </div>
              )}

              {writers.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Writer</p>
                  <p className="text-muted-foreground">{writers.join(', ')}</p>
                </div>
              )}

              {detail?.Collection && detail.Collection.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Collection</p>
                  <p>{detail.Collection.map((c) => c.tag).join(', ')}</p>
                </div>
              )}

              {item.errorMessage && (
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Error</p>
                  <p className="text-rose-400 text-xs font-mono">{item.errorMessage}</p>
                </div>
              )}
            </div>

            {/* Cast */}
            {cast.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-3">Cast</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {cast.map((actor) => (
                    <div key={actor.tag} className="flex items-center gap-2">
                      {actor.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={proxyUrl(actor.thumb) ?? ''}
                          alt={actor.tag}
                          className="h-9 w-9 rounded-full object-cover shrink-0 bg-muted"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {actor.tag[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{actor.tag}</p>
                        {actor.role && <p className="text-[11px] text-muted-foreground truncate">{actor.role}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
