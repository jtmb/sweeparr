/**
 * Demo Mode — Core helpers used by API routes and layouts.
 *
 * isDemoMode()     — Quick DB check (cached 30s). Always reads real DB.
 * getDemoContext() — Parse cookie, return {demoMode, db, sessionId, session}.
 *   In demo mode, `db` is demoPrisma (demo.db) — never the real database.
 * seedDemoData()   — Write fake data into demo.db (idempotent).
 * clearDemoData()  — Wipe demo.db data + all session files.
 * demoGenerateReport() — Build a report from seeded library cache.
 */

import { cookies } from 'next/headers'
import prisma from '@/lib/db/client'
import { demoPrisma, ensureDemoSchema } from './db'
import { getSetting } from '@/lib/db/queries'
import { getSession, saveSession, clearAllSessions, purgeOldSessions } from './session'
import { buildDemoMovies, buildDemo4KMovies, buildDemoShows, DEMO_LIBRARIES, DEMO_RULES } from './data'
import type { DemoSession, DemoReport, DemoReportItem, DemoExclusion } from './session'
import { randomUUID } from 'crypto'

export type { DemoSession, DemoReport, DemoReportItem, DemoExclusion }
export { demoPrisma }

// ─── Demo mode flag ───────────────────────────────────────────────────────────

let _cachedDemoMode: boolean | null = null
let _cacheExpiresAt = 0
const CACHE_TTL_MS = 30_000

export async function isDemoMode(): Promise<boolean> {
  if (_cachedDemoMode !== null && Date.now() < _cacheExpiresAt) {
    return _cachedDemoMode
  }
  const val = await getSetting('demoMode')
  _cachedDemoMode = val === 'true'
  _cacheExpiresAt = Date.now() + CACHE_TTL_MS
  return _cachedDemoMode
}

export function invalidateDemoModeCache(): void {
  _cachedDemoMode = null
  _cacheExpiresAt = 0
}

// ─── Context helper (server components + route handlers) ─────────────────────

export interface DemoContext {
  demoMode: boolean
  /** In demo mode: demoPrisma (demo.db). Otherwise: real prisma. Never mix. */
  db: typeof prisma
  sessionId: string | null
  session: DemoSession | null
}

/**
 * Reads the cd_demo_session cookie and returns the visitor's session + correct db.
 * In demo mode, `db` is always demoPrisma — routes must not use the real `prisma`.
 */
export async function getDemoContext(): Promise<DemoContext> {
  const demo = await isDemoMode()
  if (!demo) return { demoMode: false, db: prisma, sessionId: null, session: null }

  const cookieStore = await cookies()
  const sessionId = cookieStore.get('cd_demo_session')?.value ?? null
  if (!sessionId) return { demoMode: true, db: demoPrisma, sessionId: null, session: null }

  const session = await getSession(sessionId)
  return { demoMode: true, db: demoPrisma, sessionId, session }
}

export async function saveDemoSession(sessionId: string, session: DemoSession): Promise<void> {
  await saveSession(sessionId, session)
}

// ─── Seed / clear ─────────────────────────────────────────────────────────────

const DEMO_SEEDED_KEY = 'demoSeeded'
const DEMO_SEED_VERSION = 'v4'

async function demoSetSetting(key: string, value: string): Promise<void> {
  await demoPrisma.settings.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

async function demoGetSetting(key: string): Promise<string | null> {
  const row = await demoPrisma.settings.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function seedDemoData(): Promise<void> {
  ensureDemoSchema()

  const alreadySeeded = await demoGetSetting(DEMO_SEEDED_KEY)
  if (alreadySeeded === DEMO_SEED_VERSION) {
    // Verify caches still exist — may have been wiped
    const count = await demoPrisma.libraryCache.count()
    if (count >= 3) return // Already seeded, nothing to do
  }

  // 1. Seed LibraryListCache into demo.db Settings
  const movies = buildDemoMovies()
  const movies4k = buildDemo4KMovies()
  const shows = buildDemoShows()

  const libraryList = DEMO_LIBRARIES.map((lib) => {
    const allItems = lib.key === 'demo-1' ? movies : lib.key === 'demo-2' ? movies4k : shows
    return {
      key: lib.key,
      title: lib.title,
      type: lib.type,
      itemCount: allItems.length,
      totalSize: allItems.reduce((s, m) => s + m.fileSizeBytes, 0),
    }
  })

  await demoSetSetting('libraryListCache', JSON.stringify({
    libraries: libraryList,
    cachedAt: new Date().toISOString(),
    scanning: false,
    scanStartedAt: null,
  }))

  // 2. Seed LibraryCache per library
  const allLibraries: [string, ReturnType<typeof buildDemoMovies>][] = [
    ['demo-1', movies],
    ['demo-2', movies4k],
    ['demo-3', shows],
  ]

  for (const [sectionId, mediaItems] of allLibraries) {
    const lib = DEMO_LIBRARIES.find((l) => l.key === sectionId)!
    const serialized = mediaItems.map((m) => ({
      ...m,
      addedAt: m.addedAt.toISOString(),
      lastWatchedAt: m.lastWatchedAt?.toISOString() ?? null,
      userWatches: m.userWatches.map((w) => ({ ...w, lastWatchedAt: w.lastWatchedAt.toISOString() })),
    }))

    await demoPrisma.libraryCache.upsert({
      where: { sectionId },
      create: {
        sectionId,
        sectionJson: JSON.stringify(lib),
        mediaJson: JSON.stringify(serialized),
        scannedAt: new Date(),
        scanning: false,
      },
      update: {
        sectionJson: JSON.stringify(lib),
        mediaJson: JSON.stringify(serialized),
        scannedAt: new Date(),
        scanning: false,
      },
    })
  }

  // 3. Seed cleanup rules into demo.db (always fresh)
  await demoPrisma.cleanupRule.deleteMany()
  for (const rule of DEMO_RULES) {
    await demoPrisma.cleanupRule.create({ data: rule })
  }

  // 4. Seed a schedule config in demo.db
  await demoPrisma.scheduleConfig.deleteMany()
  await demoPrisma.scheduleConfig.create({
    data: {
      cronExpr: '0 2 * * *',
      enabled: true,
      autoDelete: false,
      libraryScanEnabled: true,
      libraryScanCron: '0 */6 * * *',
    },
  })

  await demoSetSetting(DEMO_SEEDED_KEY, DEMO_SEED_VERSION)
}

export async function clearDemoData(): Promise<void> {
  try {
    ensureDemoSchema()
    await demoPrisma.libraryCache.deleteMany()
    await demoPrisma.cleanupRule.deleteMany()
    await demoPrisma.scheduleConfig.deleteMany()
    await demoPrisma.settings.deleteMany()
  } catch { /* demo.db may not exist yet */ }
  await clearAllSessions()
  invalidateDemoModeCache()
}

// ─── Report generation for demo ───────────────────────────────────────────────

function makeId(): string {
  return randomUUID()
}

/**
 * Generates a fake cleanup report from seeded library cache.
 * Uses the real cleanup rule evaluations so the data looks authentic.
 */
export async function demoGenerateReport(sessionId: string, session: DemoSession): Promise<string> {
  const allMovies = buildDemoMovies()
  const all4K = buildDemo4KMovies()
  const allShows = buildDemoShows()
  const allMedia = [...allMovies, ...all4K, ...allShows]

  const rules = await demoPrisma.cleanupRule.findMany({ where: { enabled: true } })

  const items: DemoReportItem[] = []
  const now = Date.now()

  for (const media of allMedia) {
    for (const rule of rules) {
      // Skip if rule is scoped to a library that doesn't match
      if (rule.libraryId && rule.libraryId !== media.libraryId) continue

      const ageMs = now - media.addedAt.getTime()
      const ageDays = ageMs / 86400000
      if (ageDays < rule.minAgeDays) continue

      // Protection flags
      if (rule.protectCurrentlyPlaying && media.isCurrentlyPlaying) continue
      if (rule.protectInProgress && media.isInProgress) continue

      const reasons: string[] = []

      if (media.watchCount === 0) {
        if (rule.protectNeverWatched) continue
        reasons.push('NEVER_WATCHED')
      } else if (rule.maxDaysSinceWatched != null && media.lastWatchedAt) {
        const daysSinceWatch = (now - media.lastWatchedAt.getTime()) / 86400000
        if (daysSinceWatch < rule.maxDaysSinceWatched) continue
        reasons.push('STALE_WATCHED')
      } else if (rule.maxDaysSinceWatched == null && media.watchCount > 0) {
        reasons.push('OLD_AND_WATCHED')
      }

      if (reasons.length === 0) continue

      // Don't add the same media twice
      if (items.some((i) => i.plexRatingKey === media.plexRatingKey)) continue

      items.push({
        id: makeId(),
        reportId: '', // filled below
        mediaType: media.mediaType,
        radarrId: null,
        sonarrId: null,
        plexRatingKey: media.plexRatingKey,
        title: media.title,
        year: media.year ?? null,
        addedAt: media.addedAt.toISOString(),
        lastWatchedAt: media.lastWatchedAt?.toISOString() ?? null,
        watchCount: media.watchCount,
        fileSizeBytes: media.fileSizeBytes,
        reasons,
        ruleName: rule.name,
        status: 'pending',
        errorMessage: null,
        posterPath: null,
        createdAt: new Date().toISOString(),
      })

      break // one rule match per media item is enough
    }
  }

  const reportId = makeId()
  const totalSizeBytes = items.reduce((s, i) => s + i.fileSizeBytes, 0)
  const report: DemoReport = {
    id: reportId,
    generatedAt: new Date().toISOString(),
    status: 'READY',
    totalItems: items.length,
    totalSizeBytes,
    executedAt: null,
    triggeredBy: 'manual',
    pauseRequested: false,
    stopRequested: false,
    items: items.map((item) => ({ ...item, reportId })),
  }

  session.reports.unshift(report)
  await saveSession(sessionId, session)
  await purgeOldSessions()
  return reportId
}
