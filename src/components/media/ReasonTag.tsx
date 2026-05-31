import React from 'react'
import { Badge } from '@/components/ui/badge'
import { EyeOff, Clock, CalendarClock, Users, ServerOff } from 'lucide-react'
import type { CleanupReasonCode } from '@/types'

const REASON_LABELS: Record<CleanupReasonCode, { label: string; icon: React.ElementType; color: string; tooltip: string }> = {
  NEVER_WATCHED: {
    label: 'Never Watched',
    icon: EyeOff,
    color: 'text-rose-400',
    tooltip: 'This item has never been played by any user.',
  },
  STALE_WATCHED: {
    label: 'Stale',
    icon: Clock,
    color: 'text-orange-400',
    tooltip: 'This item was watched, but not within the configured stale window (maxDaysSinceWatched). It was last played too long ago.',
  },
  OLD_AND_WATCHED: {
    label: 'Old & Watched',
    icon: CalendarClock,
    color: 'text-amber-400',
    tooltip: 'This item has been watched and is older than the minimum age threshold (minAgeDays). No stale window is configured.',
  },
  ALL_USERS_WATCHED: {
    label: 'All Watched',
    icon: Users,
    color: 'text-emerald-400',
    tooltip: 'Every user who has access has watched this item, and it meets the age or stale criteria.',
  },
  NO_ARR_MATCH: {
    label: 'No Arr match',
    icon: ServerOff,
    color: 'text-slate-300',
    tooltip: 'This item is not tracked by Radarr or Sonarr and cannot be deleted automatically.',
  },
}

interface ReasonTagProps {
  reason: string
}

export default function ReasonTag({ reason }: ReasonTagProps) {
  const cfg = REASON_LABELS[reason as CleanupReasonCode]
  if (!cfg) return <Badge variant="outline">{reason}</Badge>

  const Icon = cfg.icon

  return (
    <div
      title={cfg.tooltip}
      className={`inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold cursor-help ${cfg.color}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {cfg.label}
    </div>
  )
}
