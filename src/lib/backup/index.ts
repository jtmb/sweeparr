import fs from 'fs/promises'
import path from 'path'

export interface BackupFileInfo {
  name: string
  path: string
  sizeBytes: number
  createdAt: string
}

function resolveFileDatasourcePath(url: string): string {
  if (!url.startsWith('file:')) {
    throw new Error('Only SQLite file: datasource URLs are supported for backup')
  }

  const filePart = url.slice('file:'.length)
  if (!filePart) throw new Error('Invalid DATABASE_URL')

  // Supports both absolute (file:/app/data/db.sqlite) and relative (file:./dev.db)
  return path.isAbsolute(filePart) ? filePart : path.resolve(process.cwd(), filePart)
}

export function getDatabaseFilePath(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db'
  return resolveFileDatasourcePath(dbUrl)
}

export function getBackupDirectoryPath(): string {
  const dbPath = getDatabaseFilePath()
  return path.join(path.dirname(dbPath), 'backups')
}

async function ensureBackupDirectory(): Promise<void> {
  await fs.mkdir(getBackupDirectoryPath(), { recursive: true })
}

function formatTs(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}${m}${day}-${h}${min}${s}`
}

export async function createDatabaseBackup(tag: 'manual' | 'scheduled' | 'pre-restore' = 'manual'): Promise<BackupFileInfo> {
  await ensureBackupDirectory()

  const dbPath = getDatabaseFilePath()
  const backupDir = getBackupDirectoryPath()
  const name = `sweeparr-${tag}-${formatTs()}.sqlite`
  const outPath = path.join(backupDir, name)

  await fs.copyFile(dbPath, outPath)
  const stat = await fs.stat(outPath)

  return {
    name,
    path: outPath,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
  }
}

export async function listBackups(limit = 50): Promise<BackupFileInfo[]> {
  try {
    const dir = getBackupDirectoryPath()
    const entries = await fs.readdir(dir)

    const files = entries
      .filter((name) => name.endsWith('.sqlite') || name.endsWith('.db'))
      .map(async (name) => {
        const p = path.join(dir, name)
        const stat = await fs.stat(p)
        return {
          name,
          path: p,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
          mtimeMs: stat.mtimeMs,
        }
      })

    const resolved = await Promise.all(files)
    return resolved
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, limit)
      .map(({ mtimeMs: _mtimeMs, ...rest }) => rest)
  } catch {
    return []
  }
}

export async function pruneOldBackups(retentionCount: number): Promise<number> {
  const keep = Math.max(1, Math.floor(retentionCount || 1))
  const backups = await listBackups(1000)
  const toDelete = backups.slice(keep)

  await Promise.all(
    toDelete.map(async (b) => {
      try {
        await fs.unlink(b.path)
      } catch {
        // Ignore individual delete failures
      }
    })
  )

  return toDelete.length
}

export async function readDatabaseFileBuffer(): Promise<Buffer> {
  return fs.readFile(getDatabaseFilePath())
}

export function resolveBackupPathByName(name: string): string {
  if (!name || path.basename(name) !== name) {
    throw new Error('Invalid backup filename')
  }

  const p = path.resolve(getBackupDirectoryPath(), name)
  if (!p.startsWith(path.resolve(getBackupDirectoryPath()) + path.sep)) {
    throw new Error('Invalid backup path')
  }

  return p
}

export async function restoreDatabaseFromFile(sourcePath: string): Promise<void> {
  const dbPath = getDatabaseFilePath()
  await fs.copyFile(sourcePath, dbPath)
}
