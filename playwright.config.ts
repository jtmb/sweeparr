import { defineConfig } from '@playwright/test'

const artifacts = process.env.SWEEPARR_UI_DIR ?? '/tmp/opencode/sweeparr-ui'
export default defineConfig({
  testDir: './tests/ui',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: `${artifacts}/results`,
  reporter: [['list'], ['html', { outputFolder: `${artifacts}/report`, open: 'never' }], ['json', { outputFile: `${artifacts}/results.json` }]],
  use: {
    baseURL: 'http://127.0.0.1:3410',
    viewport: { width: 1440, height: 1000 },
    trace: 'on', screenshot: 'on',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'node tests/ui/server.mjs',
    url: 'http://127.0.0.1:3410/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
