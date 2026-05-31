// ─── Plex ───────────────────────────────────────────────────────────────────

export interface PlexLibrary {
  key: string
  title: string
  type: 'movie' | 'show' | 'artist' | 'photo'
  agent: string
  art?: string
  thumb?: string
  count?: number
}

export interface PlexMediaItem {
  ratingKey: string
  key: string
  title: string
  year?: number
  addedAt: number // unix timestamp
  thumb?: string
  art?: string
  type: 'movie' | 'episode' | 'show'
  duration?: number
  viewCount?: number
  lastViewedAt?: number
  Media?: PlexMediaFile[]
  // For shows
  leafCount?: number
  viewedLeafCount?: number
}

export interface PlexMediaFile {
  id: number
  duration?: number
  Part?: Array<{ size?: number; file?: string }>
}

export interface PlexWatchEvent {
  historyKey: string
  ratingKey: string
  type?: string
  grandparentKey?: string
  parentKey?: string
  accountID: number
  viewedAt: number
  title: string
  thumb?: string
}

export interface PlexSession {
  ratingKey: string
  key: string
  title: string
  type: string // 'episode' | 'movie' | 'track'
  thumb?: string
  grandparentTitle?: string // show title for episodes
  grandparentThumb?: string
  parentIndex?: number // season number
  index?: number // episode number
  year?: number
  User?: { id: string; title: string; thumb?: string }
  Player?: {
    state: string
    title: string
    product?: string
    platform?: string
    address?: string
    remotePublicAddress?: string
    local?: boolean
  }
  Session?: {
    id?: string
    bandwidth?: number
    location?: string
  }
  TranscodeSession?: {
    videoDecision?: string
    audioDecision?: string
    subtitleDecision?: string
    speed?: number
    progress?: number
    throttled?: boolean
  }
  Media?: Array<{
    id?: number
    bitrate?: number
    container?: string
    videoCodec?: string
    audioCodec?: string
    videoResolution?: string
    Part?: Array<{
      Stream?: Array<{
        streamType: number // 1=video, 2=audio, 3=subtitle
        codec?: string
        height?: number
        width?: number
        channels?: number
        language?: string
        languageTag?: string
        decision?: string
        displayTitle?: string
        selected?: boolean
      }>
    }>
  }>
  viewOffset?: number
  duration?: number
}

// ─── Radarr ──────────────────────────────────────────────────────────────────

export interface RadarrMovie {
  id: number
  title: string
  year: number
  titleSlug: string
  monitored: boolean
  hasFile: boolean
  sizeOnDisk: number
  added: string // ISO date
  images: Array<{ coverType: string; url: string; remoteUrl?: string }>
  movieFile?: {
    id: number
    size: number
    dateAdded: string
  }
}

// ─── Sonarr ──────────────────────────────────────────────────────────────────

export interface SonarrSeries {
  id: number
  title: string
  year: number
  titleSlug: string
  monitored: boolean
  added: string // ISO date
  statistics: {
    sizeOnDisk: number
    episodeFileCount: number
    episodeCount: number
    percentOfEpisodes: number
  }
  images: Array<{ coverType: string; url: string; remoteUrl?: string }>
}

// ─── Enriched Media (cross-referenced) ───────────────────────────────────────

export type WatchStatus = 'watched' | 'unwatched' | 'in_progress' | 'now_playing'

export interface UserWatchEntry {
  userName: string
  watchCount: number
  lastWatchedAt: Date
}

export interface EnrichedMediaItem {
  plexRatingKey: string
  title: string
  year?: number
  mediaType: 'movie' | 'show'
  addedAt: Date
  lastWatchedAt?: Date
  watchCount: number
  fileSizeBytes: number
  posterUrl?: string
  watchStatus: WatchStatus
  radarrId?: number
  sonarrId?: number
  isCurrentlyPlaying: boolean
  isInProgress: boolean
  libraryId: string
  libraryTitle: string
  userWatches: UserWatchEntry[]
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export type CleanupReasonCode =
  | 'NEVER_WATCHED'
  | 'STALE_WATCHED'
  | 'OLD_AND_WATCHED'
  | 'ALL_USERS_WATCHED'
  | 'NO_ARR_MATCH'

export interface CleanupCandidate extends EnrichedMediaItem {
  reasons: CleanupReasonCode[]
}

export type ReportStatus = 'DRAFT' | 'READY' | 'EXECUTING' | 'PAUSED' | 'COMPLETED' | 'FAILED'
export type ItemStatus = 'pending' | 'deleted' | 'skipped' | 'error'

export interface ReportSummary {
  id: string
  generatedAt: string
  status: ReportStatus
  totalItems: number
  totalSizeBytes: number
  executedAt?: string
  triggeredBy?: string
  ruleNames?: string[]
  removedItems?: number
  clearedBytes?: number
  erroredItems?: number
}

export interface ReportItemRow {
  id: string
  reportId: string
  mediaType: string
  radarrId?: number | null
  sonarrId?: number | null
  plexRatingKey: string
  title: string
  year?: number | null
  addedAt: string
  lastWatchedAt?: string | null
  watchCount: number
  fileSizeBytes: number
  reasons: string[]
  ruleName?: string | null
  status: ItemStatus
  errorMessage?: string | null
  posterPath?: string | null
}

// ─── Settings / Config ────────────────────────────────────────────────────────

export interface ConnectionConfig {
  plexUrl: string
  plexToken: string
  radarrUrl: string
  radarrApiKey: string
  sonarrUrl: string
  sonarrApiKey: string
}

export interface CleanupRuleForm {
  id?: string
  name: string
  libraryId?: string
  enabled: boolean
  minAgeDays: number
  maxDaysSinceWatched?: number
  protectNeverWatched: boolean
  protectInProgress: boolean
}

export interface DiscordConfig {
  webhookUrl: string
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  to: string
}

export interface AppriseConfig {
  url: string
}

export interface ScheduleConfigForm {
  cronExpr: string
  enabled: boolean
  autoDelete: boolean
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalLibraries: number
  totalMediaItems: number
  totalSizeBytes: number
  candidateCount: number
  candidateSizeBytes: number
  activeReports: number
  currentlyPlaying: number
}
