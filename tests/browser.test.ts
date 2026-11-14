import { expect, it, afterAll } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { runInNewContext } from 'node:vm'
import prisma from '@/lib/db/client'
import { generateReportHtml } from '@/lib/reports/html-export'
import { htmlJson } from '@/lib/reports/encoding'

afterAll(() => prisma.$disconnect())

it('Chromium opens server and actual client exports without injected elements or script', async () => {
  const payload = '</ScRiPt > <img id="injected" src=x onerror="document.documentElement.dataset.pwned=1">'
  const report = await prisma.cleanupReport.create({ data: { status: 'READY', items: { create: { title: payload, plexRatingKey: '1', mediaType: 'movie', addedAt: new Date(0), reasons: '[]' } } }, include: { items: true } })
  const serverHtml = await generateReportHtml(report.id)
  // Execute the real browser-side generator with download APIs captured.
  const source = readFileSync('src/app/(main)/reports/[id]/page.tsx', 'utf8')
  const start = source.indexOf('  const handleExportHtml = () => {')
  const end = source.indexOf('    URL.revokeObjectURL(url)', start) + '    URL.revokeObjectURL(url)\n  }'.length
  const javascript = ts.transpile(source.slice(start, end) + '\nhandleExportHtml()', { target: ts.ScriptTarget.ES2022 })
  let clientHtml = ''
  runInNewContext(javascript, {
    report: { ...report, items: report.items.map(i => ({ ...i, fileSizeBytes: Number(i.fileSizeBytes), reasons: [] })) }, id: report.id, htmlJson,
    Blob: class { constructor(parts: string[]) { clientHtml = parts.join('') } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    document: { createElement: () => ({ click() {} }) },
  })
  for (const [name, html] of [['server', serverHtml], ['client', clientHtml]]) {
    expect(html).toContain('\\u003c')
    const file = path.join(path.dirname(process.env.DATABASE_URL!.slice(5)), `${name}-export.html`)
    writeFileSync(file, html)
    const dom = execFileSync(process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--dump-dom', '--virtual-time-budget=1000', `file://${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 })
    expect(dom).not.toContain('data-pwned=')
    expect(dom).not.toMatch(/<img[^>]+id="injected"/)
    expect(dom.match(/<script type="application\/json"/g)).toHaveLength(1)
    expect(dom).toContain('&lt;/ScRiPt')
  }
}, 70_000)
