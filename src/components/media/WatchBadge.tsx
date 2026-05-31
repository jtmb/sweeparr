import { Eye, EyeOff, PlayCircle, Clock, AlertTriangle } from 'lucide-react'
import type { WatchStatus } from '@/types'

interface WatchBadgeProps {
  status: WatchStatus
  isCandidate?: boolean
}

const STATUS_CONFIG = {
  watched: {
    label: 'Watched',
    color: 'text-emerald-400',
    icon: Eye,
    tooltip: 'At least one user has watched this',
  },
  unwatched: {
    label: 'Unwatched',
    color: 'text-rose-400',
    icon: EyeOff,
    tooltip: 'No user has watched this yet',
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-amber-400',
    icon: Clock,
    tooltip: 'Watching is in progress but not finished',
  },
  now_playing: {
    label: 'Now Playing',
    color: 'text-emerald-400',
    icon: PlayCircle,
    tooltip: 'Currently streaming in Plex',
  },
}

export default function WatchBadge({ status, isCandidate }: WatchBadgeProps) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon

  return (
    <div className="flex flex-wrap items-center gap-1">
      <div title={cfg.tooltip} className={`inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold ${cfg.color}`}>
        <Icon className="h-3 w-3 shrink-0" />
        {cfg.label}
      </div>
      {isCandidate && (
        <div className="inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-orange-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Candidate
        </div>
      )}
    </div>
  )
}
