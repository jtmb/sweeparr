import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const dbPath = process.env.DATABASE_URL!.slice(5)
mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)
db.pragma('foreign_keys = OFF')
for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]) {
  db.exec(`DROP TABLE "${row.name}"`)
}
for (const directory of readdirSync('prisma/migrations').sort()) {
  if (directory === 'migration_lock.toml') continue
  db.exec(readFileSync(path.join('prisma/migrations', directory, 'migration.sql'), 'utf8'))
}
db.close()
