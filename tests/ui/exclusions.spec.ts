import { test, expect, type BrowserContext } from '@playwright/test'

let cookies: Awaited<ReturnType<BrowserContext['cookies']>>
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  expect((await context.request.post('/api/auth/login', { data: { username: 'admin', password: 'ui-test-password' } })).ok()).toBe(true)
  cookies = await context.cookies()
  await context.close()
})
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies)
  await page.route('**/api/exclusions', route => route.fulfill({ json: [
    { id: '1', plexRatingKey: '1', title: 'Alpha Movie', year: 2000, mediaType: 'movie', watchStatus: 'watched', addedAt: '2020-01-01T00:00:00Z' },
    { id: '2', plexRatingKey: '2', title: 'Beta Show', year: 2020, mediaType: 'show', watchStatus: 'unwatched', addedAt: '2021-01-01T00:00:00Z' },
    { id: '3', plexRatingKey: '3', title: 'Gamma Movie', year: 2024, mediaType: 'movie', watchStatus: 'in_progress', addedAt: '2022-01-01T00:00:00Z' },
  ] }))
  await page.goto('/exclusions')
  await expect(page.getByRole('heading', { name: 'Exclusions', exact: true })).toBeVisible()
})

test('exclusions: search/reset, media/watch/year filters and clear', async ({ page }) => {
  const cards = page.locator('main .group.cursor-pointer')
  await page.getByPlaceholder('Search...').fill('Alpha')
  await expect(cards).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(cards).toHaveCount(3)
  await page.getByTitle('Filters', { exact: true }).click()
  await page.getByRole('button', { name: 'Movies', exact: true }).click()
  await expect(cards).toHaveCount(2)
  await page.getByRole('button', { name: 'Shows', exact: true }).click()
  await expect(cards).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear all filters', exact: true }).click()
  for (const label of ['Watched', 'Unwatched', 'In Progress']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(cards).toHaveCount(1)
    await page.getByRole('button', { name: 'Clear all filters', exact: true }).click()
  }
  await page.getByPlaceholder('Min', { exact: true }).fill('2010')
  await page.getByPlaceholder('Max', { exact: true }).fill('2021')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('Beta Show')
  await page.getByRole('button', { name: 'Clear all filters', exact: true }).click()
  await expect(cards).toHaveCount(3)
})

test('exclusions: list/grid, sizes, sort direction and selection clear', async ({ page }) => {
  for (const size of ['M', 'L', 'S']) await page.locator('main button').filter({ hasText: new RegExp(`^${size}$`) }).first().click()
  await page.locator('button:has(svg.lucide-list)').click()
  await page.getByRole('button', { name: /^Title/ }).click()
  await expect(page.locator('main .divide-y > div').first()).toContainText('Gamma Movie')
  await page.getByRole('button', { name: /^Title/ }).click()
  await expect(page.locator('main .divide-y > div').first()).toContainText('Alpha Movie')
  await page.getByRole('button', { name: /^Type/ }).click()
  await page.getByRole('button', { name: /^Excluded On/ }).click()
  await expect(page.locator('main .divide-y > div').first()).toContainText('Gamma Movie')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByText('Alpha Movie', { exact: true }).click()
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByText('1 selected', { exact: true })).toHaveCount(0)
  await page.locator('button:has(svg.lucide-layout-grid)').click()
  await expect(page.locator('main .group.cursor-pointer')).toHaveCount(3)
})
