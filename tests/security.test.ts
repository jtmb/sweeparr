/// <reference types="vite/client" />
import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { NextRequest } from 'next/server'

const jar = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => jar.has(name) ? { value: jar.get(name)! } : undefined,
  set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name),
}) }))
import prisma from '@/lib/db/client'
import { createSession } from '@/lib/auth/session'
import { htmlJson, csvCell } from '@/lib/reports/encoding'
import { imageUrl } from '@/lib/security/service-url'
import { acquireReport, executeReport, runReport } from '@/lib/cleanup/executor'
import { connectionFingerprint } from '@/lib/cleanup/safety'
import { generateReport, getEnrichedLibraryMedia } from '@/lib/cleanup/engine'
import { GET as image } from '@/app/api/images/[service]/route'
import { POST as login } from '@/app/api/auth/login/route'
import { PUT as authSettings } from '@/app/api/settings/auth/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { POST as connectionTest } from '@/app/api/settings/test/[service]/route'
import { hash } from 'bcryptjs'
import { SignJWT } from 'jose'

const routes = import.meta.glob('../src/app/api/**/route.ts')
const secret = 'synthetic-session-key-for-tests-only'
beforeEach(async () => {
  jar.clear()
  await prisma.cleanupExecutionLock.deleteMany()
  await prisma.cleanupReportItem.deleteMany()
  await prisma.cleanupReport.deleteMany()
  await prisma.cleanupRule.deleteMany()
  await prisma.libraryCache.deleteMany()
  await prisma.permanentExclusion.deleteMany()
  await prisma.settings.deleteMany()
  await prisma.authConfig.deleteMany()
  await prisma.authConfig.create({ data: { enabled: true, username: 'admin', passwordHash: await hash('test-password', 4), secretKey: secret } })
})
afterAll(() => prisma.$disconnect())
const request = (body: unknown) => new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body) })
const context = { params: Promise.resolve({ id: 'test', service: 'plex', ratingKey: '1' }) }

describe('API trust boundary', () => {
  it('every non-public export rejects missing, invalid and expired cookies before effects', async () => {
    const expired = await new SignJWT({ sub: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(new TextEncoder().encode(secret))
    for (const [file, load] of Object.entries(routes)) {
      if (file.includes('/auth/login/') || file.includes('/health/')) continue
      const source = readFileSync(file.replace('../', ''), 'utf8')
      expect(source).toContain('guardApi')
      const module = await load() as Record<string, (r: Request, c: typeof context) => Promise<Response>>
      for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
        if (typeof module[method] !== 'function') continue
        for (const token of ['', 'invalid', expired]) {
          jar.set('cd_session', token)
          jar.set('cd_demo_mode', '1')
          const response = await module[method](request({ enabled: false }), context)
          expect(response.status, `${file} ${method}`).toBe(401)
        }
      }
    }
    expect((await prisma.authConfig.findFirst())?.enabled).toBe(true)
    expect(await prisma.settings.count()).toBe(0)
    expect(await prisma.cleanupReport.count()).toBe(0)
  })
  it('auth-disabled administration works, and auth changes/logout revoke old tokens', async () => {
    jar.set('cd_session', (await createSession(secret)).token)
    expect((await authSettings(request({ password: 'new-password' }))).status).toBe(200)
    const settings = await import('@/app/api/settings/route')
    expect((await settings.GET()).status).toBe(401)
    const auth = await prisma.authConfig.findFirstOrThrow()
    jar.set('cd_session', (await createSession(auth.secretKey)).token)
    const copied = jar.get('cd_session')!
    expect((await logout()).status).toBe(200)
    jar.set('cd_session', copied)
    expect((await settings.GET()).status).toBe(401)
    await prisma.authConfig.updateMany({ data: { enabled: false } })
    expect((await settings.GET()).status).toBe(200)
  })
  it('login has a durable budget independent of username spelling and headers', async () => {
    for (let i = 0; i < 5; i++) expect((await login(request({ username: i % 2 ? 'ADMIN' : 'admin', password: 'wrong' }))).status).toBe(401)
    expect((await login(request({ username: 'admin', password: 'test-password' }))).status).toBe(429)
    await prisma.settings.deleteMany()
    expect((await login(request({ username: 'admin', password: 'test-password' }))).status).toBe(200)
  })
  it('demo visitors cannot use real integration endpoints or credentials', async () => {
    await prisma.settings.create({ data: { key: 'demoMode', value: 'true' } })
    for (const [file, load] of Object.entries(routes)) {
      if (!/images|posters|plex\/item|jobs\/status|logs\/stream/.test(file)) continue
      const module = await load() as Record<string, (r: Request, c: typeof context) => Promise<Response>>
      for (const method of ['GET', 'POST', 'DELETE']) if (module[method]) expect((await module[method](request({}), context)).status).toBe(403)
    }
    const { getConnectionConfig } = await import('@/lib/db/queries')
    await expect(getConnectionConfig()).rejects.toThrow('disabled in demo')
  })
  it('all API exports have an explicit demo disposition and no demo request reaches real services', async () => {
    const { ensureDemoSchema } = await import('@/lib/demo/db')
    const { seedDemoData } = await import('@/lib/demo')
    ensureDemoSchema()
    await seedDemoData()
    await prisma.settings.createMany({ data: [{ key: 'demoMode', value: 'true' }, { key: 'plexUrl', value: 'http://127.0.0.1:9/REAL-SENTINEL' }, { key: 'plexToken', value: 'REAL-SECRET-SENTINEL' }] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected real network access'))
    const axios = (await import('axios')).default
    const getSpy = vi.spyOn(axios, 'get').mockRejectedValue(new Error('Unexpected real network access'))
    const postSpy = vi.spyOn(axios, 'post').mockRejectedValue(new Error('Unexpected real network access'))
    const deleteSpy = vi.spyOn(axios, 'delete').mockRejectedValue(new Error('Unexpected real network access'))
    try {
      for (const [file, load] of Object.entries(routes)) {
        const module = await load() as Record<string, (r: Request, c: typeof context) => Promise<Response>>
        for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
          if (!module[method]) continue
          const response = await module[method](request({}), context)
          expect(await response.text(), `${file} ${method}`).not.toContain('SENTINEL')
        }
      }
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(getSpy).not.toHaveBeenCalled()
      expect(postSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
      expect(await prisma.cleanupReport.count()).toBe(0)
      expect(await prisma.libraryCache.count()).toBe(0)
    } finally { fetchSpy.mockRestore(); getSpy.mockRestore(); postSpy.mockRestore(); deleteSpy.mockRestore() }
  })
})

describe('export encoding', () => {
  it('never emits raw HTML delimiters or Unicode separators into script data', () => {
    for (const payload of ['</script>', '</script >', '</ScRiPt\t>', '</script\n>', '<!--', '<', '\u2028', '\u2029']) {
      const json = htmlJson({ title: payload })
      expect(json).not.toMatch(/[<\u2028\u2029]/)
      expect(JSON.parse(json).title).toBe(payload)
    }
  })
  it('neutralizes every text column and preserves CSV syntax', () => {
    for (const prefix of ['=', '+', '-', '@', '\t', '\r', '\n', ' \t=']) expect(csvCell(`${prefix}SUM(1,2)`)).toMatch(/^"'/)
    expect(csvCell('hello,"world"\n')).toBe('"hello,""world""\n"')
    expect(csvCell(2026)).toBe('"2026"')
  })
})

describe('credential-bound images', () => {
  it('rejects all caller authorities including private hosts and userinfo', () => {
    for (const value of ['http://example.test/x', 'http://127.0.0.1/x', 'http://169.254.169.254/x', 'http://10.0.0.1/x', 'http://u:p@localhost/x', '//localhost:9/x', '/\\localhost/x']) {
      expect(() => imageUrl('http://localhost:1234', value)).toThrow()
    }
    expect(imageUrl('http://localhost:1234', '/poster/1').href).toBe('http://localhost:1234/poster/1')
  })
  it('accepts decoded raster images, rejects active/mislabeled/oversized/redirected bodies', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
    const jpeg = await sharp(png).jpeg().toBuffer()
    const webp = await sharp(png).webp().toBuffer()
    let hits = 0
    const server = createServer((req, res) => {
      hits++
      expect(req.headers['x-plex-token']).toBe('fake-plex-token')
      if (req.url === '/redirect') { res.writeHead(302, { location: '/valid' }); res.end(); return }
      if (req.url === '/large') { res.writeHead(200, { 'content-length': 6 * 1024 * 1024 }); res.end(); return }
      if (req.url === '/valid') { res.end(png); return }
      if (req.url === '/jpeg') { res.end(jpeg); return }
      if (req.url === '/webp') { res.end(webp); return }
      res.setHeader('content-type', 'image/png'); res.end(req.url === '/svg' ? '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' : '<html><script>alert(1)</script></html>')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      await prisma.settings.createMany({ data: [{ key: 'plexUrl', value: base }, { key: 'plexToken', value: 'fake-plex-token' }] })
      jar.set('cd_session', (await createSession(secret)).token)
      const get = (url: string) => image(new NextRequest(`http://localhost/api/images/plex?url=${encodeURIComponent(url)}`), { params: Promise.resolve({ service: 'plex' }) })
      expect((await get('http://127.0.0.1:9/')).status).toBe(400)
      expect(hits).toBe(0)
      const good = await get('/valid')
      expect(good.status).toBe(200)
      expect(good.headers.get('content-type')).toBe('image/webp')
      expect(good.headers.get('x-content-type-options')).toBe('nosniff')
      expect(good.headers.get('cache-control')).toBe('private, no-store')
      for (const url of ['/jpeg', '/webp']) expect((await get(url)).status).toBe(200)
      for (const url of ['/svg', '/html', '/large', '/redirect']) expect((await get(url)).status).toBe(502)
      const before = hits
      for (const service of ['plex', 'radarr', 'sonarr']) {
        const response = await connectionTest(request({ [`${service}Url`]: base + '/attacker' }), { params: Promise.resolve({ service }) })
        expect((await response.json()).ok).toBe(false)
      }
      expect(hits).toBe(before)
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
  it('bounds chunked bodies, total read time, and concurrent requests', async () => {
    let held = 0
    const server = createServer((req, res) => {
      if (req.url === '/chunked') { res.write(Buffer.alloc(5 * 1024 * 1024 + 1)); res.end(); return }
      held++
      res.writeHead(200, { 'content-type': 'image/png' }); res.write('x')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      await prisma.settings.createMany({ data: [{ key: 'plexUrl', value: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }, { key: 'plexToken', value: 'fake' }] })
      jar.set('cd_session', (await createSession(secret)).token)
      const get = (url: string) => image(new NextRequest(`http://localhost/api/images/plex?url=${url}`), { params: Promise.resolve({ service: 'plex' }) })
      expect((await get('/chunked')).status).toBe(502)
      const start = Date.now()
      const responses = await Promise.all([get('/slow'), get('/slow'), get('/slow')])
      expect(responses.map(r => r.status).sort()).toEqual([429, 502, 502])
      expect(held).toBe(2)
      expect(Date.now() - start).toBeLessThan(15_000)
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  }, 20_000)
})

describe('shared deletion invariants with local Plex/Arr mocks', () => {
  it('uses stable GUIDs rather than colliding titles and rejects ambiguous stable IDs', async () => {
    let duplicate = false
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/v3/movie') { res.end(JSON.stringify([{ id: 9, tmdbId: 42, title: 'Same title', year: 2000, images: [] }, { id: 10, tmdbId: duplicate ? 42 : 99, title: 'Same title', year: 2000, images: [] }])); return }
      let data: unknown = { machineIdentifier: 'test-server' }
      if (req.url === '/library/sections') data = { Directory: [{ key: '1', title: 'Movies', type: 'movie' }] }
      else if (req.url?.startsWith('/library/sections/1/all')) data = { Metadata: [{ ratingKey: '1', title: 'Same title', year: 2000, type: 'movie', addedAt: 1, guid: 'plex://movie/test', Guid: [{ id: 'tmdb://42' }] }] }
      else if (req.url !== '/') data = { Metadata: [], Account: [] }
      res.end(JSON.stringify({ MediaContainer: data }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      await prisma.settings.createMany({ data: [{ key: 'plexUrl', value: base }, { key: 'plexToken', value: 'fake' }, { key: 'radarrUrl', value: base }, { key: 'radarrApiKey', value: 'fake' }] })
      expect((await getEnrichedLibraryMedia('1'))[0].radarrId).toBe(9)
      duplicate = true
      await expect(getEnrichedLibraryMedia('1')).rejects.toThrow('Ambiguous')
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
  async function fixture(options: { managed?: boolean; show?: boolean; playing?: boolean; episode?: boolean; playbackFail?: boolean; identityMismatch?: boolean; deleteFail?: boolean; arrMissing?: boolean } = {}) {
    let deletes = 0
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method === 'DELETE') { deletes++; res.statusCode = options.deleteFail ? 500 : 200; res.end('{}'); return }
      if (req.url?.startsWith('/api/v3/movie/')) { if (options.arrMissing) res.statusCode = 404; res.end(JSON.stringify({ id: 9, tmdbId: options.identityMismatch ? 999 : 42 })); return }
      if (req.url?.startsWith('/api/v3/series/')) { res.end(JSON.stringify({ id: 9, tvdbId: options.identityMismatch ? 999 : 42 })); return }
      let data: unknown = { machineIdentifier: 'test-server' }
      if (req.url?.startsWith('/library/metadata/')) data = { Metadata: [{ ratingKey: '1', guid: options.show ? 'plex://show/test' : 'plex://movie/test', type: options.show ? 'show' : 'movie', Guid: [{ id: options.show ? 'tvdb://42' : 'tmdb://42' }] }] }
      if (req.url === '/status/sessions') {
        if (options.playbackFail) { res.statusCode = 500; res.end('{}'); return }
        data = { Metadata: options.playing ? [{ ratingKey: options.episode ? 'episode1' : '1', type: options.episode ? 'episode' : 'movie', grandparentRatingKey: options.episode ? '1' : undefined }] : [] }
      }
      if (req.url === '/library/onDeck') data = { Metadata: [] }
      res.end(JSON.stringify({ MediaContainer: data }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const cfg = { plexUrl: base, plexToken: 'fake-plex', radarrUrl: base, radarrApiKey: 'fake-arr', sonarrUrl: options.show ? base : '', sonarrApiKey: options.show ? 'fake-sonarr' : '' }
    for (const [key, value] of Object.entries(cfg)) await prisma.settings.upsert({ where: { key }, create: { key, value }, update: { value } })
    const report = await prisma.cleanupReport.create({ data: { status: 'READY', items: { create: {
      plexRatingKey: '1', title: 'Synthetic media', mediaType: options.show ? 'show' : 'movie', radarrId: options.managed && !options.show ? 9 : null, sonarrId: options.managed && options.show ? 9 : null,
      addedAt: new Date(0), reasons: '[]', safetySnapshot: JSON.stringify({ guid: options.show ? 'plex://show/test' : 'plex://movie/test', stableId: 42, server: 'test-server', connections: connectionFingerprint(cfg), rule: { id: 'rule' } }),
    } } } })
    return { report, deletes: () => deletes, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
  }
  it('requires explicit direct-Plex approval; scheduled/omitted permission skips', async () => {
    for (const flag of [undefined, false, true]) {
      const f = await fixture()
      try { await executeReport(f.report.id, { allowPlexDeletion: flag }); expect(f.deletes()).toBe(flag ? 1 : 0) }
      finally { await f.close() }
    }
  })
  it('legitimate stable Arr match deletes exactly once', async () => {
    const f = await fixture({ managed: true })
    try { expect((await executeReport(f.report.id)).deleted).toBe(1); expect(f.deletes()).toBe(1) }
    finally { await f.close() }
  })
  it.each([{ playing: true }, { playing: true, episode: true, show: true, managed: true }, { playbackFail: true }, { managed: true, identityMismatch: true }])('fails closed for %j', async options => {
    const f = await fixture(options)
    try { await executeReport(f.report.id, { allowPlexDeletion: true }); expect(f.deletes()).toBe(0) }
    finally { await f.close() }
  })
  it('legitimate stable Sonarr series deletes exactly once', async () => {
    const f = await fixture({ managed: true, show: true })
    try { expect((await executeReport(f.report.id)).deleted).toBe(1); expect(f.deletes()).toBe(1) }
    finally { await f.close() }
  })
  it('fails closed if permanent-exclusion lookup fails', async () => {
    const f = await fixture({ managed: true })
    const schema = await prisma.$queryRawUnsafe<Array<{ sql: string }>>("SELECT sql FROM sqlite_master WHERE name = 'PermanentExclusion'")
    try {
      const owner = await acquireReport(f.report.id)
      await prisma.$executeRawUnsafe('DROP TABLE "PermanentExclusion"')
      await runReport(f.report.id, owner)
      expect(f.deletes()).toBe(0)
    } finally {
      await prisma.$executeRawUnsafe(schema[0].sql)
      await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "PermanentExclusion_plexRatingKey_key" ON "PermanentExclusion"("plexRatingKey")')
      await f.close()
    }
  })
  it('checks exclusions added after creation and integration changes', async () => {
    const f = await fixture({ managed: true })
    try {
      await prisma.permanentExclusion.create({ data: { plexRatingKey: '1', title: 'Protected', mediaType: 'movie' } })
      await executeReport(f.report.id)
      expect(f.deletes()).toBe(0)
      await prisma.cleanupReport.update({ where: { id: f.report.id }, data: { status: 'READY' } })
      await prisma.cleanupReportItem.updateMany({ data: { status: 'pending' } })
      await prisma.permanentExclusion.deleteMany()
      await prisma.settings.update({ where: { key: 'radarrUrl' }, data: { value: 'http://127.0.0.1:9' } })
      await executeReport(f.report.id)
      expect(f.deletes()).toBe(0)
    } finally { await f.close() }
  })
  it('rejects DRAFT, double acquisition, active deletion and crash takeover', async () => {
    const f = await fixture()
    try {
      await prisma.cleanupReport.update({ where: { id: f.report.id }, data: { status: 'DRAFT' } })
      await expect(acquireReport(f.report.id)).rejects.toThrow()
      await prisma.cleanupReport.update({ where: { id: f.report.id }, data: { status: 'READY' } })
      const results = await Promise.allSettled([acquireReport(f.report.id, { allowPlexDeletion: true }), acquireReport(f.report.id)])
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      jar.set('cd_session', (await createSession(secret)).token)
      const { DELETE } = await import('@/app/api/reports/[id]/route')
      expect((await DELETE(request({}), { params: Promise.resolve({ id: f.report.id }) })).status).toBe(409)
      const winner = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<string>
      await expect(acquireReport(f.report.id)).rejects.toThrow()
      await runReport(f.report.id, winner.value)
      expect(f.deletes()).toBe(1)
    } finally { await f.close() }
  })
  it('does not retry ambiguous effects or silently fall back to Plex', async () => {
    const f = await fixture({ managed: true, deleteFail: true })
    try {
      await executeReport(f.report.id, { allowPlexDeletion: true })
      expect(f.deletes()).toBe(1)
      expect((await prisma.cleanupReportItem.findFirst())?.status).toBe('unknown')
      jar.set('cd_session', (await createSession(secret)).token)
      const { DELETE } = await import('@/app/api/reports/[id]/route')
      expect((await DELETE(request({}), { params: Promise.resolve({ id: f.report.id }) })).status).toBe(409)
      await expect(executeReport(f.report.id)).rejects.toThrow()
    } finally { await f.close() }
  })
  it('Arr 404 never changes authority, and resume retains the approved policy', async () => {
    const missing = await fixture({ managed: true, arrMissing: true })
    try {
      await executeReport(missing.report.id, { allowPlexDeletion: true })
      expect(missing.deletes()).toBe(0)
    } finally { await missing.close() }
    const paused = await fixture()
    try {
      await prisma.cleanupReport.update({ where: { id: paused.report.id }, data: { status: 'PAUSED', allowPlexDeletion: true } })
      const owner = await acquireReport(paused.report.id, { resume: true, allowPlexDeletion: false })
      await runReport(paused.report.id, owner)
      expect(paused.deletes()).toBe(1)
    } finally { await paused.close() }
  })
  it('permanent exclusions are omitted from generated reports', async () => {
    await prisma.cleanupRule.create({ data: { name: 'test', minAgeDays: 0 } })
    await prisma.permanentExclusion.create({ data: { plexRatingKey: '1', title: 'Protected', mediaType: 'movie' } })
    await prisma.libraryCache.create({ data: { sectionId: '1', sectionJson: JSON.stringify({ key: '1', title: 'Movies', type: 'movie' }), mediaJson: JSON.stringify([{ plexRatingKey: '1', addedAt: new Date(0).toISOString(), userWatches: [] }]) } })
    for (const source of ['manual', 'scheduled'] as const) {
      const id = await generateReport(source)
      expect(await prisma.cleanupReportItem.count({ where: { reportId: id } })).toBe(0)
    }
  })
})
