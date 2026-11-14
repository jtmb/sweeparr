import { test, expect, type BrowserContext, type Page } from '@playwright/test'

let cookies: Awaited<ReturnType<BrowserContext['cookies']>>
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  expect((await context.request.post('/api/auth/login', { data: { username: 'admin', password: 'ui-test-password' } })).ok()).toBe(true)
  cookies = await context.cookies()
  await context.close()
})
test.beforeEach(async ({ page }) => { await page.context().addCookies(cookies) })

async function reportFixture(page: Page, status = 'READY') {
  const report = {
    id: 'fixture', status, generatedAt: '2026-01-01T00:00:00Z', totalItems: 120,
    totalSizeBytes: 120e9, allowPlexDeletion: false,
    items: Array.from({ length: 120 }, (_, i) => ({
      id: `item-${i}`, reportId: 'fixture', plexRatingKey: `key-${i}`, title: `Report fixture ${String(i).padStart(3, '0')}`,
      year: 2020, mediaType: i % 2 ? 'show' : 'movie', fileSizeBytes: 1e9,
      addedAt: '2020-01-01T00:00:00Z', lastWatchedAt: null, watchCount: 0,
      reasons: ['NEVER_WATCHED'], ruleName: 'Fixture rule', status: 'pending', radarrId: i + 1,
    })),
  }
  await page.route('**/api/reports/fixture', route => route.fulfill({ json: report }))
  await page.route('**/api/exclusions', route => route.fulfill({ json: [] }))
  await page.goto('/reports/fixture')
  await expect(page.getByRole('heading', { name: /120 Candidates/ })).toBeVisible()
  return report
}

test('report: pause, resume and stop follow server state', async ({ page }) => {
  const report = await reportFixture(page, 'EXECUTING')
  let consent: unknown
  await page.route('**/api/reports/fixture/pause', route => { report.status = 'PAUSED'; return route.fulfill({ json: { ok: true } }) })
  await page.route('**/api/reports/fixture/resume', route => {
    consent = route.request().postDataJSON()
    report.status = 'EXECUTING'
    return route.fulfill({ json: { ok: true } })
  })
  await page.route('**/api/reports/fixture/stop', route => { report.status = 'COMPLETED'; return route.fulfill({ json: { ok: true } }) })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect.poll(() => consent).toEqual({ allowPlexDeletion: false })
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByText('Execution Summary', { exact: true })).toBeVisible()
})

test('report: retry rejection preserves uncertain outcome and displays server error', async ({ page }) => {
  const report = await reportFixture(page, 'COMPLETED')
  report.items[0].status = 'unknown'
  report.items[1].status = 'error'
  await page.reload()
  await page.route('**/api/reports/fixture/retry-errors', route => route.fulfill({ status: 409, json: { error: 'Generate a fresh report before retrying' } }))
  await page.getByRole('button', { name: /Retry .* Error/ }).click()
  await expect(page.getByText('Generate a fresh report before retrying', { exact: true })).toBeVisible()
  expect(report.items[0].status).toBe('unknown')
  await expect(page.getByText('Execution Summary', { exact: true })).toBeVisible()
})

test('report: pagination, every sort column, status and media filters', async ({ page }) => {
  await reportFixture(page)
  await page.locator('main button:has(svg.lucide-chevron-right)').click()
  await expect(page.locator('main')).toContainText('Showing 51–100')
  await page.locator('main button:has(svg.lucide-chevron-left)').click()
  await expect(page.locator('main')).toContainText('Showing 1–50')
  for (const name of ['Title', 'Reason', 'Last Watched', 'Added', 'Size', 'Status']) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.getByRole('button', { name, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('button', { name: 'movie', exact: true }).click()
  await expect(page.locator('main')).toContainText('of 60')
  await page.getByRole('button', { name: 'Clear all filters', exact: true }).click()
  for (const status of ['deleted', 'deleting', 'skipped', 'error', 'unknown']) {
    await page.getByRole('button', { name: status, exact: true }).click()
    await expect(page.locator('main')).toContainText(/No .*match/i)
    await page.getByRole('button', { name: 'Clear all filters', exact: true }).click()
  }
})

test('report: temporary exclude, hide/show, restore and permanent exclusion payload', async ({ page }) => {
  await reportFixture(page)
  let added: { items: { plexRatingKey: string }[] } | undefined
  await page.route('**/api/exclusions', route => {
    if (route.request().method() === 'POST') added = route.request().postDataJSON()
    return route.fulfill({ json: [] })
  })
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByText('Report fixture 000', { exact: true }).click()
  await page.getByRole('button', { name: 'Exclude 1', exact: true }).click()
  await expect(page.getByRole('heading', { name: /119 Candidates/ })).toBeVisible()
  await expect(page.getByText('Report fixture 000', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show excluded', exact: true }).click()
  await expect(page.getByText('Report fixture 000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hide excluded', exact: true }).click()
  await expect(page.getByText('Report fixture 000', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show excluded', exact: true }).click()
  await page.getByText('Report fixture 000', { exact: true }).click()
  await page.getByRole('button', { name: 'Un-exclude 1', exact: true }).click()
  await expect(page.getByRole('heading', { name: /120 Candidates/ })).toBeVisible()
  await page.getByText('Report fixture 000', { exact: true }).click()
  await page.getByRole('button', { name: 'Add to Exclusions (1)', exact: true }).click()
  await expect.poll(() => added?.items[0]?.plexRatingKey).toBe('key-0')
})
