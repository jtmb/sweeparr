import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const dir = process.env.SWEEPARR_UI_DIR ?? '/tmp/opencode/sweeparr-ui'
const report = JSON.parse(readFileSync(`${dir}/results.json`, 'utf8'))
const stats = report.stats
if (!stats || stats.unexpected || stats.skipped || stats.flaky || !stats.expected) {
  throw new Error(`Cannot certify a clean run: ${JSON.stringify(stats)}`)
}
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const files = ['playwright.config.ts', 'package-lock.json', ...readdirSync('tests/ui').filter(f => /\.(ts|mjs)$/.test(f)).map(f => `tests/ui/${f}`)]
const manifest = {
  recordedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  buildId: readFileSync('.next/BUILD_ID', 'utf8').trim(),
  stats,
  reportSha256: hash(`${dir}/results.json`),
  sources: Object.fromEntries(files.map(file => [file, hash(file)])),
}
writeFileSync(`${dir}/evidence.json`, JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(`${dir}/evidence.md`, `# Browser test evidence\n\n- Recorded: ${manifest.recordedAt}\n- Base commit: ${manifest.commit} (working tree tests; see source hashes)\n- Production build: ${manifest.buildId}\n- Passed: ${stats.expected}\n- Failed: ${stats.unexpected}\n- Skipped: ${stats.skipped}\n- Flaky: ${stats.flaky}\n- Duration: ${(stats.duration / 1000).toFixed(1)} seconds\n- Results JSON SHA-256: \`${manifest.reportSha256}\`\n\nOpen \`report/index.html\` for individual assertions, screenshots and traces. Coverage and limitations: \`tests/ui/README.md\`. External integrations are simulated where that ledger specifies.\n`)
console.log(`Evidence saved: ${dir}/evidence.md (${stats.expected} passed, no failures/skips/retries)`)
