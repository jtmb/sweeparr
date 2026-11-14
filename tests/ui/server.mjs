import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import { hashSync } from 'bcryptjs'

const dir = process.env.SWEEPARR_UI_DIR ?? '/tmp/opencode/sweeparr-ui'
mkdirSync(dir, { recursive: true })
for (const name of ['evidence.json', 'evidence.md']) rmSync(`${dir}/${name}`, { force: true })
const file = `${dir}/app.db`
for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true })
const db = new Database(file)
for (const name of readdirSync('prisma/migrations').sort()) {
  if (name !== 'migration_lock.toml') db.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'))
}
db.prepare('INSERT INTO AuthConfig (id, enabled, username, passwordHash, secretKey) VALUES (?, ?, ?, ?, ?)')
  .run('ui', 1, 'admin', hashSync('ui-test-password', 4), 'synthetic-ui-secret')
db.close()
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3410'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: `file:${file}`, DEMO_DATABASE_PATH: `${dir}/demo.db`, DEMO_SESSIONS_DIR: `${dir}/sessions`, SWEEPARR_DISABLE_BACKGROUND: '1', NEXT_TELEMETRY_DISABLED: '1' },
})
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 0))
