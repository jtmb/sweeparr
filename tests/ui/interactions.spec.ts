import { test, expect, type BrowserContext, type Page } from '@playwright/test'

let cookies: Awaited<ReturnType<BrowserContext['cookies']>>
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  const response = await context.request.post('/api/auth/login', { data: { username: 'admin', password: 'ui-test-password' } })
  expect(response.ok()).toBe(true)
  cookies = await context.cookies()
  await context.close()
})
test.beforeEach(async ({ page }) => { await page.context().addCookies(cookies) })

const media = Array.from({ length: 120 }, (_, i) => ({
  plexRatingKey: `fixture-${i}`, title: `Fixture ${String(i).padStart(3, '0')}`, year: 2000 + i % 25,
  mediaType: i % 2 ? 'show' : 'movie', addedAt: '2020-01-01T00:00:00Z',
  lastWatchedAt: '2021-01-01T00:00:00Z', watchCount: i,
  fileSizeBytes: (i + 1) * 1024 ** 3, watchStatus: ['watched', 'unwatched', 'in_progress', 'now_playing'][i % 4],
  userWatches: [{ userName: 'Fixture viewer', watchCount: i, lastWatchedAt: '2021-01-01T00:00:00Z' }],
  isCurrentlyPlaying: i % 4 === 3, isInProgress: i % 4 === 2,
}))

async function libraryFixture(page: Page) {
  await page.route('**/api/plex/library/fixture', route => route.fulfill({ json: { section: { title: 'Fixture Library', type: 'movie' }, media } }))
  await page.route('**/api/plex/library/fixture/scan', route => route.fulfill({ json: { scanning: false } }))
  await page.route('**/api/exclusions', route => route.fulfill({ json: [{ ...media[0], id: 'excluded-0' }] }))
  await page.route('**/api/plex/item/*', route => route.fulfill({ json: { summary: 'Synthetic metadata summary', Genre: [{ tag: 'Drama' }], duration: 7200000 } }))
  await page.goto('/libraries/fixture')
  await expect(page.getByRole('heading', { name: 'Fixture Library' })).toBeVisible()
}

test('library: search reset, grid sizes, list pagination and sorting', async ({ page }) => {
  await libraryFixture(page)
  await page.getByPlaceholder('Search...').fill('Fixture 119')
  await expect(page.locator('main .group.cursor-pointer')).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.locator('main .group.cursor-pointer')).toHaveCount(120)
  for (const size of ['M', 'L', 'S']) {
    await page.locator('main button').filter({ hasText: new RegExp(`^${size}$`) }).first().click()
    await expect(page.locator('main .group.cursor-pointer')).toHaveCount(120)
  }
  await page.locator('button:has(svg.lucide-list)').click()
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('main')).toContainText('Page 2')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await page.getByRole('button', { name: /^Title/ }).click()
  await page.getByRole('button', { name: /^Title/ }).click()
  await expect(page.getByRole('button', { name: /^Title/ })).toContainText('Title')
  await page.locator('button:has(svg.lucide-layout-grid)').click()
  await expect(page.locator('main .group.cursor-pointer')).toHaveCount(120)
})

test('library: all watch statuses, media type, year, size, watch count and exclusion filters', async ({ page }) => {
  await libraryFixture(page)
  await page.getByTitle('Filters', { exact: true }).click()
  for (const label of ['Watched', 'Unwatched', 'In Progress', 'Now Playing']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('main .group.cursor-pointer')).toHaveCount(30)
    await page.getByRole('button', { name: 'Clear all filters' }).click()
  }
  for (const label of ['Movies', 'Shows']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('main .group.cursor-pointer')).toHaveCount(60)
    await page.getByRole('button', { name: 'Clear all filters' }).click()
  }
  for (const [index, min, max, count] of [[0, '2024', '2024', 4], [1, '10', '20', 9], [2, '10', '20', 11]] as const) {
    await page.getByPlaceholder('Min', { exact: true }).nth(index).fill(min)
    await page.getByPlaceholder('Max', { exact: true }).nth(index).fill(max)
    await expect(page.locator('main .group.cursor-pointer')).toHaveCount(count)
    await page.getByRole('button', { name: 'Clear all filters' }).click()
  }
  await page.getByRole('button', { name: 'Excluded', exact: true }).click()
  await expect(page.locator('main .group.cursor-pointer')).toHaveCount(1)
  await page.getByRole('button', { name: 'Not excluded', exact: true }).click()
  await expect(page.locator('main .group.cursor-pointer')).toHaveCount(119)
})

test('media detail: metadata, maximize, restore, close and Escape', async ({ page }) => {
  await libraryFixture(page)
  await page.getByText('Fixture 000', { exact: true }).click()
  await expect(page.getByText('Synthetic metadata summary')).toBeVisible()
  await page.getByRole('button', { name: 'Maximize', exact: true }).click()
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByText('Synthetic metadata summary')).toHaveCount(0)
  await page.getByText('Fixture 000', { exact: true }).click()
  await expect(page.getByText('Synthetic metadata summary')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Synthetic metadata summary')).toHaveCount(0)
})

test('library: per-user watch expansion and collapse', async ({ page }) => {
  await libraryFixture(page)
  await page.getByPlaceholder('Search...').fill('Fixture 001')
  await page.locator('button:has(svg.lucide-list)').click()
  await page.locator('main button:has(svg.lucide-chevron-down)').last().click()
  await expect(page.getByText('Fixture viewer', { exact: true })).toBeVisible()
  await expect(page.getByText('Most Recent', { exact: true })).toBeVisible()
  await page.locator('main button:has(svg.lucide-chevron-up)').last().click()
  await expect(page.getByText('Most Recent', { exact: true })).toHaveCount(0)
})

test('library: selection clear, delete cancel, successful deletion and scan polling', async ({ page }) => {
  await libraryFixture(page)
  let deleted: unknown
  await page.route('**/api/plex/library/fixture/items/delete', route => {
    deleted = route.request().postDataJSON()
    return route.fulfill({ json: { deleted: 1, failed: 0, results: [{ ratingKey: 'fixture-0', ok: true }] } })
  })
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByText('Fixture 000', { exact: true }).click()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByText('1 selected', { exact: true })).toHaveCount(0)
  await page.getByText('Fixture 000', { exact: true }).click()
  await page.getByRole('button', { name: 'Delete from Plex', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  expect(deleted).toBeUndefined()
  await page.getByRole('button', { name: 'Delete from Plex', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete permanently', exact: true }).click()
  await expect.poll(() => deleted).toEqual({ ratingKeys: ['fixture-0'] })
  await page.getByRole('button', { name: 'Rescan', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Scanning…', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Rescan', exact: true })).toBeEnabled({ timeout: 10_000 })
})

test('activity: live session, stop stream, tabs, refresh and section persistence', async ({ page }) => {
  let reads = 0
  let stopped: unknown
  await page.route('**/api/plex/activity', route => {
    reads++
    return route.fulfill({ json: { sessions: [{ ratingKey: 'fixture-0', title: 'Fixture playing', type: 'movie', year: 2020, User: { id: '1', title: 'Fixture viewer' }, Session: { id: 'fixture-session' }, Player: { state: 'playing', title: 'Fixture player' } }] } })
  })
  await page.route('**/api/plex/stats', route => route.fulfill({ json: {
    mostWatchedMovies: [], mostWatchedShows: [], mostActiveLibraries: [], mostActiveUsers: [], recentlyWatched: [], recentlyAdded: [], libraryList: [],
  } }))
  await page.route('**/api/plex/terminate', route => {
    stopped = route.request().postDataJSON()
    return route.fulfill({ json: { ok: true } })
  })
  await page.goto('/activity')
  await expect(page.getByText('Fixture playing', { exact: true })).toBeVisible()
  await page.getByTitle('Stop stream', { exact: true }).click()
  await expect.poll(() => stopped).toEqual({ sessionId: 'fixture-session' })
  await page.getByRole('button', { name: 'Watch Statistics', exact: true }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('activity-section-watch-statistics'))).toBe('false')
  await page.reload()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('activity-section-watch-statistics'))).toBe('false')
  await page.getByRole('tab', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible()
  const before = reads
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect.poll(() => reads).toBeGreaterThan(before)
})

test('activity: recently added carousel scrolls right and left', async ({ page }) => {
  await page.route('**/api/plex/activity', route => route.fulfill({ json: { sessions: [] } }))
  await page.route('**/api/plex/stats', route => route.fulfill({ json: {
    mostWatchedMovies: [], mostWatchedShows: [], mostActiveLibraries: [], mostActiveUsers: [], recentlyWatched: [], libraryList: [],
    recentlyAdded: media.slice(0, 20).map(item => ({ ...item, posterUrl: null })),
  } }))
  await page.goto('/activity')
  const scroller = page.locator('main .overflow-x-auto').first()
  await page.getByRole('button', { name: 'Scroll right', exact: true }).click()
  await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Scroll left', exact: true }).click()
  await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBe(0)
})
