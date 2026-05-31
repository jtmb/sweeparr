import { NextResponse } from 'next/server'
import prisma from '@/lib/db/client'
import { getConnectionConfig, saveConnectionConfig } from '@/lib/db/queries'
import { getDemoContext, demoPrisma } from '@/lib/demo'

export async function GET() {
  try {
    const { demoMode } = await getDemoContext()
    const connections = demoMode ? {
      plexUrl: '', plexToken: '',
      radarrUrl: '', radarrApiKey: '',
      sonarrUrl: '', sonarrApiKey: '',
    } : await getConnectionConfig()

    // In demo mode, read rules/schedule/notifications from demo.db — not real DB
    const db = demoMode ? demoPrisma : prisma
    const rules = await db.cleanupRule.findMany({ orderBy: { createdAt: 'asc' } })
    const schedule = await db.scheduleConfig.findFirst()
    const notifications = demoMode ? [] : await prisma.notificationConfig.findMany()

    const notifMap: Record<string, Record<string, unknown>> = {}
    for (const n of notifications) {
      notifMap[n.type] = { enabled: n.enabled, ...(JSON.parse(n.config) as Record<string, unknown>) }
    }

    return NextResponse.json({
      connections: demoMode ? connections : {
        ...connections,
        plexToken: connections.plexToken ? '*'.repeat(connections.plexToken.length) : '',
        radarrApiKey: connections.radarrApiKey ? '*'.repeat(connections.radarrApiKey.length) : '',
        sonarrApiKey: connections.sonarrApiKey ? '*'.repeat(connections.sonarrApiKey.length) : '',
      },
      rules: rules.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      schedule: schedule
        ? { ...schedule, lastRunAt: schedule.lastRunAt?.toISOString(), updatedAt: schedule.updatedAt.toISOString() }
        : null,
      notifications: notifMap,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      section: 'connections' | 'schedule' | 'notifications'
      data: Record<string, unknown>
    }

    if (body.section === 'connections') {
      const { demoMode } = await getDemoContext()
      if (demoMode) {
        return NextResponse.json({ error: 'Connections cannot be changed in demo mode' }, { status: 403 })
      }
      // Strip masked placeholders (any all-* string) so they never overwrite the real stored secrets
      const safe = Object.fromEntries(
        Object.entries(body.data).filter(([, v]) => typeof v !== 'string' || !/^\*+$/.test(v))
      )
      await saveConnectionConfig(safe as unknown as Parameters<typeof saveConnectionConfig>[0])
    } else if (body.section === 'schedule') {
      const { demoMode } = await getDemoContext()
      if (demoMode) {
        return NextResponse.json({ error: 'Schedule cannot be changed in demo mode' }, { status: 403 })
      }
      const d = body.data as {
        cronExpr: string; enabled: boolean; autoDelete: boolean
        libraryScanEnabled: boolean; libraryScanCron: string
      }
      const existing = await prisma.scheduleConfig.findFirst()
      if (existing) {
        await prisma.scheduleConfig.update({ where: { id: existing.id }, data: d })
      } else {
        await prisma.scheduleConfig.create({ data: d })
      }
      // Reload scheduler
      const { reloadScheduler } = await import('@/lib/scheduler')
      await reloadScheduler()
    } else if (body.section === 'notifications') {
      const { demoMode } = await getDemoContext()
      if (demoMode) {
        return NextResponse.json({ error: 'Notifications cannot be changed in demo mode' }, { status: 403 })
      }
      const { type, enabled, ...config } = body.data as {
        type: string
        enabled: boolean
        [key: string]: unknown
      }
      await prisma.notificationConfig.upsert({
        where: { type },
        update: { enabled, config: JSON.stringify(config) },
        create: { type, enabled, config: JSON.stringify(config) },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
