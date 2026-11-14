// Run after a production build; starts and stops only its own loopback server.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { hashSync } from 'bcryptjs'

const artifacts = process.env.SWEEPARR_TEST_DIR ?? '/tmp/opencode/sweeparr-artifacts'
mkdirSync(artifacts, { recursive: true })
const file = path.join(artifacts, 'http-smoke.db')
rmSync(file, { force: true })
const db = new Database(file)
for (const directory of readdirSync('prisma/migrations').sort()) {
  if (directory !== 'migration_lock.toml') db.exec(readFileSync(path.join('prisma/migrations', directory, 'migration.sql'), 'utf8'))
}
db.prepare('INSERT INTO AuthConfig (id, enabled, username, passwordHash, secretKey) VALUES (?, ?, ?, ?, ?)')
  .run('test', 1, 'admin', hashSync('test-password', 4), 'synthetic-http-session-secret')
db.close()

const port = 3407
let output = ''
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, DATABASE_URL: `file:${file}`, DEMO_DATABASE_PATH: path.join(artifacts, 'http-demo.db'), SWEEPARR_DISABLE_BACKGROUND: '1', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server readiness timeout')), 30_000)
    const ready = chunk => { if (String(chunk).includes('Ready')) { clearTimeout(timeout); resolve() } }
    child.stdout.on('data', ready)
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)) })
  })
  const base = `http://127.0.0.1:${port}`
  assert.equal((await fetch(`${base}/api/health`)).status, 200)
  assert.equal((await fetch(`${base}/api/settings`)).status, 401)
  assert.equal((await fetch(`${base}/api/settings`, { headers: { cookie: 'cd_demo_mode=1; cd_session=invalid' } })).status, 401)
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test-password' }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  assert.equal((await fetch(`${base}/api/settings`, { headers: { cookie } })).status, 200)
  assert.equal((await fetch(`${base}/api/settings/auth`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'changed-test-password' }) })).status, 200)
  assert.equal((await fetch(`${base}/api/settings`, { headers: { cookie } })).status, 401)
  console.log('HTTP smoke: health, direct API denial, cookie bypass denial, login, authorized read, password revocation passed')
} finally {
  child.kill('SIGTERM')
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve) })
  writeFileSync(path.join(artifacts, 'http-server.log'), output)
}
