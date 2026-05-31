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

const SESSIONS_DIR = path.join(process.cwd(), '.demo-sessions')
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
    const raw = await fs.readFile(sessionPath(id), 'utf8')
    const data = JSON.parse(raw) as DemoSession
    // Touch last access
    data.lastAccessAt = Date.now()
    return data
  } catch {
    return emptySession()
  }
}

export async function saveSession(id: string, session: DemoSession): Promise<void> {
  await ensureDir()
  session.lastAccessAt = Date.now()
  await fs.writeFile(sessionPath(id), JSON.stringify(session), 'utf8')
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
            const raw = await fs.readFile(path.join(SESSIONS_DIR, f), 'utf8')
            const data = JSON.parse(raw) as DemoSession
            if (now - data.lastAccessAt > SESSION_TTL_MS) {
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
