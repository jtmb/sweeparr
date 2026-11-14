import { guardApi } from '@/lib/auth/guard'
import { getConnectionConfig } from '@/lib/db/queries'
import prisma from '@/lib/db/client'
import { createPlexClient } from '@/lib/plex/client'
import { executeReport } from '@/lib/cleanup/executor'
import { connectionFingerprint, stableId } from '@/lib/cleanup/safety'
import { boundedJson } from '@/lib/security/json'

/** Explicit library deletion uses the same audited safety path as cleanup. */
export async function POST(req: Request) {
  const denied = await guardApi()
  if (denied) return denied
  try {
    const body = await boundedJson(req) as { ratingKeys?: string[] }
    if (!Array.isArray(body.ratingKeys) || !body.ratingKeys.length || body.ratingKeys.length > 100 || body.ratingKeys.some(k => typeof k !== 'string' || !/^\d+$/.test(k))) {
      return Response.json({ error: '1–100 numeric rating keys required' }, { status: 400 })
    }
    const cfg = await getConnectionConfig()
    const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
    const server = (await plex.getServerInfo()).machineIdentifier
    if (!server) throw new Error('Server identity unavailable')
    const items = []
    for (const key of new Set(body.ratingKeys)) {
      const item = await plex.getMetadata(key)
      if (!item.guid || !['movie', 'show'].includes(item.type)) throw new Error('Media identity unavailable')
      items.push({
        plexRatingKey: key, title: item.title, mediaType: item.type, addedAt: new Date(item.addedAt * 1000), reasons: '["EXPLICIT_SELECTION"]',
        safetySnapshot: JSON.stringify({ guid: item.guid, stableId: stableId(item, item.type === 'movie' ? 'tmdb' : 'tvdb'), server, connections: connectionFingerprint(cfg), rule: { id: 'explicit-selection' } }),
      })
    }
    const report = await prisma.cleanupReport.create({ data: { status: 'READY', triggeredBy: 'manual', totalItems: items.length, items: { create: items } } })
    const result = await executeReport(report.id, { allowPlexDeletion: true })
    const rows = await prisma.cleanupReportItem.findMany({ where: { reportId: report.id } })
    return Response.json({ deleted: result.deleted, failed: result.failed + result.skipped, reportId: report.id,
      results: rows.map(row => ({ ratingKey: row.plexRatingKey, ok: row.status === 'deleted', error: row.errorMessage })),
    })
  } catch {
    return Response.json({ error: 'Deletion could not pass safety checks; inspect reports' }, { status: 409 })
  }
}
