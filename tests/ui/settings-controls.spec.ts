import { test, expect, type BrowserContext } from '@playwright/test'

let cookies: Awaited<ReturnType<BrowserContext['cookies']>>
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  expect((await context.request.post('/api/auth/login', { data: { username: 'admin', password: 'ui-test-password' } })).ok()).toBe(true)
  cookies = await context.cookies()
  await context.close()
})
test.beforeEach(async ({ page }) => { await page.context().addCookies(cookies) })

test('schedule: both cron helpers generate hourly, daily and weekly expressions', async ({ page }) => {
  await page.goto('/settings/schedule')
  for (const index of [0, 1]) {
    await page.getByRole('button', { name: 'Cron Helper', exact: true }).nth(index).click()
    const target = page.getByPlaceholder(index === 0 ? '0 * * * *' : '0 2 * * *', { exact: true })
    for (const [frequency, expression] of [['Every N hours', '0 */6 * * *'], ['Daily', '0 2 * * *'], ['Weekly', '0 2 * * 0']]) {
      await page.getByRole('combobox').first().click()
      await page.getByRole('option', { name: frequency, exact: true }).click()
      await page.getByRole('button', { name: 'Apply Generated Cron', exact: true }).click()
      await expect(target).toHaveValue(expression)
      if (index === 0 && frequency === 'Daily') {
        await expect(page.getByText('Cleanup was automatically moved to 03:00 to avoid overlapping with library scan.')).toBeVisible()
        await expect(page.getByPlaceholder('0 2 * * *', { exact: true })).toHaveValue('0 3 * * *')
      }
    }
    await page.getByRole('button', { name: 'Reset to Default', exact: true }).click()
    await expect(target).toHaveValue(index === 0 ? '0 * * * *' : '0 2 * * *')
    await page.getByRole('button', { name: 'Keep Current', exact: true }).click()
    await page.getByRole('button', { name: 'Cron Helper', exact: true }).nth(index).click()
  }
})

test('schedule: run now success and failure responses', async ({ page }) => {
  let fail = false
  await page.route('**/api/reports', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    return route.fulfill({ status: fail ? 500 : 200, json: fail ? { error: 'Fixture analysis failed' } : { reportId: 'fixture-report' } })
  })
  await page.goto('/settings/schedule')
  await page.getByRole('button', { name: 'Run Cleanup Now' }).click()
  await expect(page.getByText('Report generated: fixture-report')).toBeVisible()
  fail = true
  await page.getByRole('button', { name: 'Run Cleanup Now' }).click()
  await expect(page.getByText('Error: Fixture analysis failed')).toBeVisible()
})

for (const [channel, placeholder] of [['Discord', 'https://discord.com/api/webhooks/...'], ['Apprise', 'http://apprise:8000/notify']]) {
  test(`notifications: ${channel} test success and failure`, async ({ page }) => {
    let fail = false
    await page.route('**/api/settings/test/*', route => route.fulfill({ json: fail ? { ok: false, error: 'Fixture delivery failed' } : { ok: true } }))
    await page.goto('/settings/notifications')
    await page.getByRole('tab', { name: channel, exact: true }).click()
    await page.getByPlaceholder(placeholder, { exact: true }).fill('http://127.0.0.1:3497/fixture')
    await page.getByRole('button', { name: 'Send Test', exact: true }).click()
    await expect(page.getByText(/Test sent/)).toBeVisible()
    fail = true
    await page.getByRole('button', { name: 'Send Test', exact: true }).click()
    await expect(page.getByText(/Fixture delivery failed/)).toBeVisible()
  })
}

test('auth: save credentials, sign in with new credentials and toggle protection', async ({ page }) => {
  await page.goto('/settings/auth')
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('admin')
  await page.getByLabel('Username', { exact: true }).fill('fixture-admin')
  await page.locator('#new-password').fill('changed-ui-password')
  await page.locator('#confirm-password').fill('changed-ui-password')
  await page.getByRole('button', { name: 'Save Credentials' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.goto('/libraries')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Username', { exact: true }).fill('fixture-admin')
  await page.getByLabel('Password', { exact: true }).fill('changed-ui-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.locator('aside')).toBeVisible()
  await page.goto('/settings/auth')
  await expect(page.getByRole('switch')).toBeChecked()
  await page.getByRole('switch').click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('switch')).not.toBeChecked()
  await page.getByLabel('Username', { exact: true }).fill('admin')
  await page.locator('#new-password').fill('ui-test-password')
  await page.locator('#confirm-password').fill('ui-test-password')
  await page.getByRole('button', { name: 'Save Credentials' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('switch').click()
  await expect(page.getByRole('switch')).toBeChecked()
  await page.goto('/libraries')
  await expect(page).toHaveURL(/\/login$/)
})
