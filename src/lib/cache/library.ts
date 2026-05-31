import prisma from '@/lib/db/client'
import type { EnrichedMediaItem, PlexLibrary } from '@/types'

export interface LibraryCacheEntry {
  section: PlexLibrary
  media: EnrichedMediaItem[]
  scannedAt: Date
  scanning: boolean
}

const STALE_SCAN_MS = 15 * 60 * 1000 // 15 minutes

export async function getCachedLibrary(sectionId: string): Promise<LibraryCacheEntry | null> {
  const row = await prisma.libraryCache.findUnique({ where: { sectionId } })
  if (!row) return null
  // Auto-clear stale scanning flag so the UI never gets stuck
  let scanning = row.scanning
  if (scanning && row.scanStartedAt && Date.now() - row.scanStartedAt.getTime() > STALE_SCAN_MS) {
    await prisma.libraryCache.update({ where: { sectionId }, data: { scanning: false, scanStartedAt: null } })
    scanning = false
  } else if (scanning && !row.scanStartedAt) {
    // Legacy row with no start time — treat as stale
    await prisma.libraryCache.update({ where: { sectionId }, data: { scanning: false } })
    scanning = false
  }
  return {
    section: JSON.parse(row.sectionJson) as PlexLibrary,
    media: (JSON.parse(row.mediaJson) as Array<Record<string, unknown>>).map(deserializeItem),
    scannedAt: row.scannedAt,
    scanning,
  }
}

export async function markLibraryScanning(sectionId: string): Promise<void> {
  await prisma.libraryCache.upsert({
    where: { sectionId },
    create: { sectionId, sectionJson: '{}', mediaJson: '[]', scanning: true, scanStartedAt: new Date() },
    update: { scanning: true, scanStartedAt: new Date() },
  })
}

export async function saveLibraryCache(
  sectionId: string,
  section: PlexLibrary,
  media: EnrichedMediaItem[]
): Promise<void> {
  await prisma.libraryCache.upsert({
    where: { sectionId },
    create: {
      sectionId,
      sectionJson: JSON.stringify(section),
      mediaJson: JSON.stringify(media),
      scannedAt: new Date(),
      scanning: false,
    },
    update: {
      sectionJson: JSON.stringify(section),
      mediaJson: JSON.stringify(media),
      scannedAt: new Date(),
      scanning: false,
    },
  })
}

export async function isLibraryScanning(sectionId: string): Promise<boolean> {
  const row = await prisma.libraryCache.findUnique({ where: { sectionId } })
  return row?.scanning ?? false
}

export async function getAllCachedSectionIds(): Promise<string[]> {
  const rows = await prisma.libraryCache.findMany({ select: { sectionId: true } })
  return rows.map((r) => r.sectionId)
}

// Dates are serialized to strings in JSON — restore them
function deserializeItem(raw: Record<string, unknown>): EnrichedMediaItem {
  return {
    ...(raw as unknown as EnrichedMediaItem),
    addedAt: new Date(raw.addedAt as string),
    lastWatchedAt: raw.lastWatchedAt ? new Date(raw.lastWatchedAt as string) : undefined,
    userWatches: ((raw.userWatches ?? []) as Array<Record<string, unknown>>).map((w) => ({
      ...(w as { userName: string; watchCount: number }),
      lastWatchedAt: new Date(w.lastWatchedAt as string),
    })),
  }
}
