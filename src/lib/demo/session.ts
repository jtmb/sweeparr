/**
 * Demo Mode — Per-visitor file-based session store.
 *
 * Each browser visitor gets a UUID cookie (cd_demo_session). Their mutable
 * state (reports, exclusions) is stored in .demo-sessions/{uuid}.json so it
 * survives Turbopack worker restarts and is isolated from other visitors.
 * Clearing the browser cookie produces a new UUID → fresh session.
 */

import { promises as fs } from 'fs'
import path from 'path'
import { takeBudget } from '@/lib/auth/rate-limit'

const SESSIONS_DIR = process.env.DEMO_SESSIONS_DIR ?? path.join(process.cwd(), '.demo-sessions')
const SESSION_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoReportItem {
  id: string
  reportId: string
  mediaType: 'movie' | 'show'
  radarrId: null
  sonarrId: null
  plexRatingKey: string
  title: string
  year: number | null
  addedAt: string // ISO
  lastWatchedAt: string | null
  watchCount: number
  fileSizeBytes: number
  reasons: string[]
  ruleName: string | null
  status: 'pending' | 'deleted' | 'skipped' | 'error'
  errorMessage: string | null
  posterPath: string | null
  createdAt: string
}

export interface DemoReport {
  id: string
  generatedAt: string
  status: 'DRAFT' | 'READY' | 'EXECUTING' | 'PAUSED' | 'COMPLETED'
  totalItems: number
  totalSizeBytes: number
  executedAt: string | null
  triggeredBy: 'manual' | 'scheduled'
  pauseRequested: boolean
  stopRequested: boolean
  items: DemoReportItem[]
}

export interface DemoExclusion {
  id: string
  plexRatingKey: string
  title: string
  year: number | null
  mediaType: string
  posterPath: string | null
  addedAt: string
  watchStatus: string | null
}

export interface DemoSession {
  revision?: number
  createdAt: number // unix ms
  lastAccessAt: number
  reports: DemoReport[]
  exclusions: DemoExclusion[]
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true })
}

function sessionPath(id: string): string {
  // Sanitize: only allow UUID-shaped IDs to prevent path traversal
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid session ID')
  return path.join(SESSIONS_DIR, `${id}.json`)
}

function emptySession(): DemoSession {
  const now = Date.now()
  return { createdAt: now, lastAccessAt: now, reports: [], exclusions: [] }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSession(id: string): Promise<DemoSession> {
  try {
    if ((await fs.stat(sessionPath(id))).size > 1024 * 1024) throw new Error('Session over quota')
    const raw = await fs.readFile(sessionPath(id), 'utf8')
    const data = JSON.parse(raw) as DemoSession
    if (Date.now() - data.createdAt > SESSION_TTL_MS) return emptySession()
    // Touch last access
    data.lastAccessAt = Date.now()
    return data
  } catch {
    return emptySession()
  }
}

export async function saveSession(id: string, session: DemoSession): Promise<void> {
  if (!await takeBudget('demo-storage', 60, 60_000)) throw new Error('Demo mutation rate exceeded')
  await ensureDir()
  // Atomic cross-process admission + optimistic concurrency. A concurrent writer
  // receives a conflict rather than overwriting another visitor mutation.
  const lock = path.join(SESSIONS_DIR, '.write-lock')
  await fs.mkdir(lock)
  try {
    await purgeOldSessions()
    if (session.exclusions.length > 500 || session.reports.length > 10) throw new Error('Demo item quota exceeded')
    for (const exclusion of session.exclusions) {
      if (Object.values(exclusion).some(v => typeof v === 'string' && v.length > 2048)) throw new Error('Demo field too long')
    }
    const target = sessionPath(id)
    let previous: DemoSession | null = null
    try { previous = JSON.parse(await fs.readFile(target, 'utf8')) } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    if ((previous?.revision ?? 0) !== (session.revision ?? 0)) throw new Error('Concurrent demo update; reload and retry')
    const files = (await fs.readdir(SESSIONS_DIR)).filter(f => f.endsWith('.json'))
    if (!previous && files.length >= 100) throw new Error('Demo session quota exceeded')
    if (Date.now() - session.createdAt > SESSION_TTL_MS) throw new Error('Demo session expired')
    session.lastAccessAt = Date.now()
    session.revision = (session.revision ?? 0) + 1
    const raw = JSON.stringify(session)
    if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('Demo byte quota exceeded')
    const temp = `${target}.tmp`
    await fs.writeFile(temp, raw, { encoding: 'utf8', mode: 0o600 })
    await fs.rename(temp, target)
  } finally { await fs.rmdir(lock) }
}

export async function clearAllSessions(): Promise<void> {
  try {
    const files = await fs.readdir(SESSIONS_DIR)
    await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map((f) => fs.unlink(path.join(SESSIONS_DIR, f)).catch(() => {}))
    )
  } catch {
    // Directory may not exist yet — fine
  }
}

export async function purgeOldSessions(): Promise<void> {
  try {
    const files = await fs.readdir(SESSIONS_DIR)
    const now = Date.now()
    await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          try {
            if ((await fs.stat(path.join(SESSIONS_DIR, f))).size > 1024 * 1024) {
              await fs.unlink(path.join(SESSIONS_DIR, f))
              return
            }
            const raw = await fs.readFile(path.join(SESSIONS_DIR, f), 'utf8')
            const data = JSON.parse(raw) as DemoSession
            if (now - data.createdAt > SESSION_TTL_MS) {
              await fs.unlink(path.join(SESSIONS_DIR, f))
            }
          } catch {
            // Corrupted file — remove it
            await fs.unlink(path.join(SESSIONS_DIR, f)).catch(() => {})
          }
        })
    )
  } catch {
    // Directory may not exist — fine
  }
}
