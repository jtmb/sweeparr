import { defineConfig } from 'vitest/config'
import path from 'node:path'

const artifacts = process.env.SWEEPARR_TEST_DIR ?? '/tmp/opencode/sweeparr-artifacts/tests'
export default defineConfig({
  resolve: { alias: { '@': path.resolve('src') } },
  cacheDir: path.join(artifacts, 'vite'),
  test: {
    include: ['tests/**/*.test.ts'], fileParallelism: false,
    env: {
      DATABASE_URL: `file:${artifacts}/test.db`,
      DEMO_DATABASE_PATH: `${artifacts}/demo.db`,
      DEMO_SESSIONS_DIR: `${artifacts}/sessions`,
      SWEEPARR_DISABLE_BACKGROUND: '1',
    },
    setupFiles: ['tests/setup.ts'],
  },
})
