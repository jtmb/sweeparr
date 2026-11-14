import { test, expect, type Page, type BrowserContext } from '@playwright/test'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('ui-test-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.locator('aside')).toBeVisible()
}

let cookies: Awaited<ReturnType<BrowserContext['cookies']>>
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  expect((await context.request.post('/api/auth/login', { data: { username: 'admin', password: 'ui-test-password' } })).ok()).toBe(true)
  await context.request.put('/api/settings/system', { data: { demoMode: false } })
  cookies = await context.cookies()
  await context.close()
})
test.beforeEach(async ({ page }, testInfo) => {
  await page.context().addCookies(cookies)
  await page.route('**/api/images/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>' }))
  if (/^(navigation:|login rejects)/.test(testInfo.title)) await page.goto('/')
})

test('Plex authorization: popup, polling, server selection, connection test and sign out', async ({ page }) => {
  await page.route('**/api/plex/auth*', route => route.fulfill({ json: route.request().method() === 'POST'
    ? { pinId: 1, authUrl: 'about:blank' }
    : { authenticated: true, token: 'synthetic-token', servers: [
      { name: 'Local fixture', url: 'http://127.0.0.1:3491', local: true },
      { name: 'Remote fixture', url: 'http://127.0.0.1:3492', local: false },
    ] } }))
  await page.route('**/api/settings/test/*', route => route.fulfill({ json: { ok: true, name: 'Fixture server', version: '1.2.3' } }))
  await page.goto('/settings/connections')
  const popup = page.context().waitForEvent('page')
  await page.getByRole('button', { name: 'Sign in with Plex', exact: true }).click()
  await (await popup).close()
  await expect(page.getByText('Signed in to Plex', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Sign in with Plex to auto-fill')).toHaveValue('http://127.0.0.1:3491')
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: /Remote fixture/ }).click()
  await expect(page.getByPlaceholder('Sign in with Plex to auto-fill')).toHaveValue('http://127.0.0.1:3492')
  for (const button of await page.getByRole('button', { name: 'Test Connection', exact: true }).all()) await button.click()
  await expect(page.getByText('Connected · v1.2.3 · Fixture server', { exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByPlaceholder('Sign in with Plex to auto-fill')).toBeDisabled()
})

test('connection tests display integration errors', async ({ page }) => {
  await page.route('**/api/settings/test/*', route => route.fulfill({ status: 502, json: { ok: false, error: 'Fixture connection refused' } }))
  await page.goto('/settings/connections')
  await page.getByRole('button', { name: 'Test Connection', exact: true }).nth(1).click()
  await expect(page.getByText('Fixture connection refused', { exact: true })).toBeVisible()
})

test('logs: SSE entries, each tag filter, job status and clear', async ({ page }) => {
  const tags = ['scheduler', 'library-scan', 'cleanup', 'poster-backfill']
  let sent = false
  await page.route('**/api/logs/stream', route => {
    const body = sent ? ': heartbeat\n\n' : tags.map((tag, id) =>
      `data: ${JSON.stringify({ id, tag, level: 'info', timestamp: new Date().toISOString(), message: `Fixture log ${tag}` })}\n\n`).join('')
    sent = true
    return route.fulfill({ contentType: 'text/event-stream', body })
  })
  let cleared = false
  await page.route('**/api/jobs/status', route => {
    if (route.request().method() === 'DELETE') cleared = true
    return route.fulfill({ json: { running: [{ id: 'cleanup', label: 'Cleanup', startedAt: new Date().toISOString() }], schedules: [] } })
  })
  await page.goto('/settings/logs')
  await expect(page.getByText('1 job currently running')).toBeVisible()
  for (const [index, label] of ['Scheduler', 'Library Scan', 'Cleanup', 'Poster Backfill'].entries()) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.getByText(`Fixture log ${tags[index]}`, { exact: true }).first()).toBeVisible()
    for (const tag of tags.filter(t => t !== tags[index])) await expect(page.getByText(`Fixture log ${tag}`, { exact: true })).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect.poll(() => cleared).toBe(true)
  await expect(page.getByText('Fixture log scheduler', { exact: true })).toHaveCount(0)
})

test('login rejects invalid password and logout revokes browser access', async ({ page }) => {
  await page.getByTitle('Log out').click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('incorrect')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.locator('form')).toContainText(/invalid/i)
  await page.goto('/libraries')
  await expect(page).toHaveURL(/\/login$/)
  await login(page)
  cookies = await page.context().cookies()
})

for (const [label, path, heading] of [
  ['Activity', '/activity', 'Activity'], ['Libraries', '/libraries', 'Libraries'],
  ['Reports', '/reports', 'Reports'], ['Exclusions', '/exclusions', 'Exclusions'],
  ['Cleanup', '/cleanup', 'Cleanup'], ['Connections', '/settings/connections', 'Connections'],
  ['Rules', '/settings/rules', 'Cleanup Rules'], ['Schedule', '/settings/schedule', 'Schedule'],
  ['Notifications', '/settings/notifications', 'Notifications'], ['Logs', '/settings/logs', 'Logs'],
  ['Appearance', '/settings/appearance', 'Appearance'], ['Auth', '/settings/auth', 'Authentication'],
  ['System', '/settings/system', 'System'],
]) {
  test(`navigation: ${label}, sidebar collapse and expand`, async ({ page }) => {
    await page.locator('aside').getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(page.locator('aside').getByTitle(label, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect(page.locator('aside').getByRole('link', { name: label, exact: true })).toBeVisible()
  })
}

test('appearance: every choice persists across reload and reset restores defaults', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/settings/appearance')
  const groups: [string, [string, string][]][] = [
    ['theme', [['Default Radarr orange','default'], ['Sonarr Sonarr teal','sonarr'], ['Prowlarr Prowlarr orange','prowlarr'], ['Jellyfin Jellyfin purple','jellyfin'], ['Lidarr Lidarr green','lidarr'], ['Readarr Readarr gold','readarr'], ['Bazarr Bazarr rose','bazarr'], ['Whisparr Whisparr pink','whisparr'], ['Silver Soft silver','silver'], ['Stone Muted stone','stone']]],
    ['background', [['Default Radarr dark','default'], ['Black Pure black','black'], ['Slate Cool slate','slate'], ['Navy Deep navy','navy'], ['Warm Warm dark','warm']]],
    ['text', [['Default Pure white','default'], ['Off-white Neutral grey','offwhite']]],
    ['radius', [['None','none'], ['Small','sm'], ['Default','md'], ['Large','lg'], ['Pill','full']]],
  ]
  for (const [key, choices] of groups) for (const [name, value] of choices) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect.poll(() => page.evaluate(k => localStorage.getItem(k), key)).toBe(value)
    await page.reload()
    if ((key === 'radius' && value === 'md') || (['background', 'text'].includes(key) && value === 'default')) {
      await expect(page.locator('html')).not.toHaveAttribute(`data-${key}`)
    } else await expect(page.locator('html')).toHaveAttribute(`data-${key}`, value)
  }
  await page.getByRole('button', { name: 'Reset to Defaults' }).click()
  for (const [key, value] of [['theme','default'], ['background','default'], ['text','default'], ['radius','md']]) {
    await expect.poll(() => page.evaluate(k => localStorage.getItem(k), key)).toBe(value)
  }
})

test('rules: cancel, create, protections, disable, edit, delete and reload persistence', async ({ page }) => {
  await page.goto('/settings/rules')
  await page.getByRole('button', { name: 'Add Rule' }).click()
  await expect(page.getByRole('button', { name: 'Create Rule', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Add Rule' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('e.g. Old Watched Movies').fill('UI functional rule')
  await dialog.locator('input[type=number]').first().fill('45')
  await dialog.getByPlaceholder('Leave empty for no limit').fill('120')
  for (const toggle of await dialog.getByRole('switch').all()) await toggle.click()
  await page.getByRole('button', { name: 'Create Rule', exact: true }).click()
  await expect(page.getByText('UI functional rule', { exact: true })).toBeVisible()
  await page.reload()
  const row = page.locator('div.bg-card').filter({ hasText: 'UI functional rule' })
  await expect(row).toContainText('Min age: 45d')
  await expect(row.getByRole('switch')).not.toBeChecked()
  await row.getByRole('switch').click()
  await expect(row.getByRole('switch')).toBeChecked()
  await row.getByRole('button').nth(0).click()
  await dialog.getByPlaceholder('e.g. Old Watched Movies').fill('UI edited rule')
  await dialog.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText('UI edited rule', { exact: true })).toBeVisible()
  page.once('dialog', d => d.accept())
  await page.locator('div.bg-card').filter({ hasText: 'UI edited rule' }).getByRole('button').nth(1).click()
  await expect(page.getByText('UI edited rule', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('No rules configured yet')).toBeVisible()
})

test('auth: username length, password length, confirmation validation', async ({ page }) => {
  await page.goto('/settings/auth')
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('admin')
  await page.getByLabel('Username', { exact: true }).fill('ab')
  await page.getByRole('button', { name: 'Save Credentials' }).click()
  await expect(page.getByText('Username must be at least 3 characters')).toBeVisible()
  await page.getByLabel('Username', { exact: true }).fill('admin')
  await page.locator('#new-password').fill('short')
  await page.getByRole('button', { name: 'Save Credentials' }).click()
  await expect(page.getByText('Password must be at least 8 characters')).toBeVisible()
  await page.locator('#new-password').fill('long-enough-password')
  await page.locator('#confirm-password').fill('different-password')
  await page.getByRole('button', { name: 'Save Credentials' }).click()
  await expect(page.getByText('Passwords do not match')).toBeVisible()
})

test('connections: save real settings, reload and reset form', async ({ page }) => {
  const loaded = page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'GET')
  await page.goto('/settings/connections')
  await (await loaded).finished()
  const inputs = page.locator('main input')
  await inputs.nth(1).fill('http://127.0.0.1:3499')
  await inputs.nth(2).fill('synthetic-radarr-key')
  await inputs.nth(3).fill('http://127.0.0.1:3498')
  await inputs.nth(4).fill('synthetic-sonarr-key')
  const saved = page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  expect((await saved).ok()).toBe(true)
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(inputs.nth(1)).toHaveValue('http://127.0.0.1:3499')
  await expect(inputs.nth(3)).toHaveValue('http://127.0.0.1:3498')
  await page.getByRole('button', { name: 'Reset to Defaults' }).click()
  for (const input of await inputs.all()) await expect(input).toHaveValue('')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
})

for (const [channel, placeholder, value] of [
  ['Discord', 'https://discord.com/api/webhooks/...', 'http://127.0.0.1:3497/discord'],
  ['Email', 'smtp.example.com', '127.0.0.1'],
  ['Apprise', 'http://apprise:8000/notify', 'http://127.0.0.1:3497/notify'],
]) {
  test(`notifications: ${channel} fields, all switches, save, reload and reset`, async ({ page }) => {
    await page.goto('/settings/notifications')
    await page.getByRole('tab', { name: channel, exact: true }).click()
    const panel = page.getByRole('tabpanel')
    await panel.getByPlaceholder(placeholder, { exact: true }).fill(value)
    const states: boolean[] = []
    for (const toggle of await panel.getByRole('switch').all()) {
      states.push(!(await toggle.isChecked()))
      await toggle.click()
    }
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel.getByText('Saved', { exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: channel, exact: true }).click()
    await expect(panel.getByPlaceholder(placeholder, { exact: true })).toHaveValue(value)
    for (let i = 0; i < states.length; i++) await expect(panel.getByRole('switch').nth(i)).toBeChecked({ checked: states[i] })
    await panel.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(panel.getByPlaceholder(placeholder, { exact: true })).toHaveValue('')
  })
}

test('email: Gmail defaults and recipient chips', async ({ page }) => {
  await page.goto('/settings/notifications')
  await page.getByRole('tab', { name: 'Email', exact: true }).click()
  await page.getByRole('button', { name: 'Apply Gmail defaults' }).click()
  await expect(page.getByPlaceholder('smtp.example.com')).toHaveValue('smtp.gmail.com')
  await expect(page.locator('input[type=number]')).toHaveValue('587')
  const recipient = page.getByPlaceholder('user@example.com — press Enter or comma to add')
  await recipient.fill('first@example.test')
  await recipient.press('Enter')
  await expect(page.getByText('first@example.test', { exact: true })).toBeVisible()
  await recipient.fill('second@example.test')
  await recipient.press(',')
  await expect(page.getByText('second@example.test', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByText('first@example.test', { exact: true })).toHaveCount(0)
})

test('schedule: all presets, switches, save persistence and reset', async ({ page }) => {
  await page.goto('/settings/schedule')
  await page.getByRole('switch').nth(0).check()
  await page.getByRole('switch').nth(1).check()
  const scan = page.getByPlaceholder('0 * * * *', { exact: true })
  const cleanup = page.getByPlaceholder('0 2 * * *', { exact: true })
  for (const [name, value] of [['Every hour','0 * * * *'], ['Every 6 hours','0 */6 * * *'], ['Daily at midnight','0 0 * * *']]) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(scan).toHaveValue(value)
  }
  for (const [name, value] of [['Daily at 2am','0 2 * * *'], ['Weekly Sun 3am','0 3 * * 0'], ['Monthly 1st 4am','0 4 1 * *']]) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(cleanup).toHaveValue(value)
  }
  const states: boolean[] = []
  for (const toggle of await page.getByRole('switch').all()) {
    states.push(!(await toggle.isChecked()))
    await toggle.click()
  }
  await page.getByRole('button', { name: 'Save Schedule' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(scan).toHaveValue('0 0 * * *')
  await expect(cleanup).toHaveValue('0 4 1 * *')
  for (let i = 0; i < states.length; i++) await expect(page.getByRole('switch').nth(i)).toBeChecked({ checked: states[i] })
  await page.getByRole('button', { name: 'Reset to Defaults' }).click()
  await expect(scan).toHaveValue('0 * * * *')
  await expect(cleanup).toHaveValue('0 2 * * *')
})

test('demo: enable, browse library, search, select, exclude, remove exclusion, reset and disable', async ({ page }) => {
  await page.goto('/settings/system')
  const reloaded = page.waitForEvent('load')
  await page.getByRole('switch').click()
  try {
    await expect(page.getByText('Demo mode is active')).toBeVisible()
    await reloaded
    await page.goto('/libraries')
    const library = page.locator('main a[href^="/libraries/"]').first()
    await expect(library).toBeVisible()
    await library.click()
    await expect(page.getByPlaceholder('Search...')).toBeVisible()
    await page.getByPlaceholder('Search...').fill('no-such-title-ui-test')
    await expect(page.getByText('No items match your filters')).toBeVisible()
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    const title = await page.locator('main .group.cursor-pointer p').first().innerText()
    await page.locator('main .group.cursor-pointer').first().click()
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Exclude from cleanup/i }).click()
    await page.goto('/exclusions')
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.getByText(title, { exact: true }).click()
    await page.getByRole('button', { name: 'Remove exclusion', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Remove exclusion', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByText('Removed 1 exclusion.')).toBeVisible()
    await page.reload()
    await expect(page.getByText('No permanent exclusions yet.')).toBeVisible()
    await page.goto('/settings/system')
    await page.getByRole('button', { name: 'Reset Demo Data' }).click()
    await expect(page.getByRole('button', { name: 'Demo data reset!' })).toBeVisible()
  } finally {
    await page.goto('/settings/system')
    await expect(page.getByRole('switch')).toBeChecked()
    await page.getByRole('switch').click()
    await expect(page.getByText('Demo mode is active')).toHaveCount(0)
  }
})

test('demo reports: rule selection, generation, search, execution, downloads, rerun and deletion', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/settings/system')
  const reloaded = page.waitForEvent('load')
  await page.getByRole('switch').click()
  try {
    await expect(page.getByText('Demo mode is active')).toBeVisible()
    await reloaded
    await page.goto('/cleanup')
    await page.getByRole('button', { name: 'Generate Report', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /Deselect All/ }).click()
    await expect(dialog.getByRole('button', { name: /Run Report/ })).toBeDisabled()
    await dialog.getByRole('button', { name: /Select All/ }).click()
    await dialog.getByRole('button', { name: /Run Report/ }).click()
    await expect(page.getByText('Report generated successfully.')).toBeVisible()
    await page.getByRole('button', { name: 'View', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Candidates/ })).toBeVisible()
    await page.getByPlaceholder('Search items…').fill('no-such-title-ui-test')
    await expect(page.locator('main')).toContainText(/No .*match/i)
    await page.getByPlaceholder('Search items…').fill('')
    await page.getByTitle('Grid view', { exact: true }).click()
    await page.getByTitle('List view', { exact: true }).click()
    await page.getByRole('button', { name: 'Execute Cleanup' }).click()
    await expect(dialog.getByRole('checkbox').first()).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Execute Cleanup' }).click()
    await dialog.getByRole('checkbox').first().check()
    await dialog.getByRole('button', { name: /Delete .* Items/ }).click()
    await expect(page.getByText('Execution Summary', { exact: true })).toBeVisible({ timeout: 30_000 })
    for (const format of ['CSV', 'HTML']) {
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: format, exact: true }).click()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`))
      await download.saveAs(test.info().outputPath(download.suggestedFilename()))
      expect(await download.failure()).toBeNull()
    }
    await page.getByRole('button', { name: 'Rerun', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Execute Cleanup' })).toBeVisible()
    await page.goto('/reports')
    const links = page.locator('main a[href^="/reports/"]')
    await expect(links.first()).toBeVisible()
    const count = await links.count()
    await links.first().getByRole('button').click()
    await expect(links).toHaveCount(count - 1)
  } finally {
    await page.goto('/settings/system')
    await expect(page.getByRole('switch')).toBeChecked()
    await page.getByRole('switch').click()
    await expect(page.getByText('Demo mode is active')).toHaveCount(0)
  }
})
