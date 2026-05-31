import prisma from './client'
import type { ConnectionConfig } from '@/types'

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.settings.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.settings.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.settings.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function getConnectionConfig(): Promise<ConnectionConfig> {
  const keys = ['plexUrl', 'plexToken', 'radarrUrl', 'radarrApiKey', 'sonarrUrl', 'sonarrApiKey']
  const map = await getSettings(keys)
  return {
    plexUrl: map.plexUrl ?? '',
    plexToken: map.plexToken ?? '',
    radarrUrl: map.radarrUrl ?? '',
    radarrApiKey: map.radarrApiKey ?? '',
    sonarrUrl: map.sonarrUrl ?? '',
    sonarrApiKey: map.sonarrApiKey ?? '',
  }
}

export async function saveConnectionConfig(cfg: ConnectionConfig): Promise<void> {
  await Promise.all(
    Object.entries(cfg).map(([key, value]) => setSetting(key, value))
  )
}
