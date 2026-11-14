import { beforeEach, afterAll, expect, it } from 'vitest'
import { mkdir, rm, readdir, writeFile, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import prisma from '@/lib/db/client'
import { getSession, saveSession, purgeOldSessions } from '@/lib/demo/session'

const directory = process.env.DEMO_SESSIONS_DIR!
beforeEach(async () => {
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  await prisma.settings.deleteMany()
})
afterAll(() => prisma.$disconnect())

it('enforces field/item/byte bounds without partially writing a session', async () => {
  const id = randomUUID()
  const session = await getSession(id)
  await saveSession(id, session)
  const original = await readFile(path.join(directory, `${id}.json`), 'utf8')
  const exclusion = { id: 'a', plexRatingKey: '1', title: 'test', year: null, mediaType: 'movie', posterPath: null, addedAt: '', watchStatus: null }
  for (const mutate of [
    () => { session.exclusions = Array(501).fill(exclusion) },
    () => { session.exclusions = [{ ...exclusion, title: 'x'.repeat(2049) }] },
    () => { session.exclusions = Array(500).fill({ ...exclusion, title: 'x'.repeat(2048), posterPath: 'y'.repeat(2048) }) },
  ]) {
    mutate()
    await expect(saveSession(id, session)).rejects.toThrow()
    expect(await readFile(path.join(directory, `${id}.json`), 'utf8')).toBe(original)
  }
})

it('caps aggregate sessions and expires them without report generation', async () => {
  const now = Date.now()
  for (let i = 0; i < 100; i++) await writeFile(path.join(directory, `${randomUUID()}.json`), JSON.stringify({ createdAt: now, lastAccessAt: now, reports: [], exclusions: [] }))
  const id = randomUUID()
  await expect(saveSession(id, await getSession(id))).rejects.toThrow('quota')
  for (const file of await readdir(directory)) await writeFile(path.join(directory, file), JSON.stringify({ createdAt: now - 5 * 3600_000, lastAccessAt: now, reports: [], exclusions: [] }))
  await purgeOldSessions()
  expect(await readdir(directory)).toHaveLength(0)
  await saveSession(id, await getSession(id))
  expect((await readdir(directory)).filter(f => f.endsWith('.json'))).toHaveLength(1)
})

it('rejects stale concurrent mutations and enforces a durable mutation budget', async () => {
  const id = randomUUID()
  const a = await getSession(id), b = await getSession(id)
  await saveSession(id, a)
  await expect(saveSession(id, b)).rejects.toThrow('Concurrent')
  await prisma.settings.upsert({ where: { key: 'security:budget:demo-storage' }, create: { key: 'security:budget:demo-storage', value: JSON.stringify({ until: Date.now() + 60_000, count: 60 }) }, update: { value: JSON.stringify({ until: Date.now() + 60_000, count: 60 }) } })
  await expect(saveSession(id, await getSession(id))).rejects.toThrow('rate')
})
