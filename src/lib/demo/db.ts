/**
 * Demo Mode — Isolated SQLite database.
 *
 * All demo data reads/writes go to demo.db, completely separate from the real DB.
 * The real `prisma` client is only used to check the `demoMode` setting and AuthConfig.
 */

import { PrismaClient } from '@/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

// Full schema DDL — combines all migrations with IF NOT EXISTS for idempotency.
// Keep in sync with prisma/migrations whenever new migrations are added.
const DEMO_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Settings_key_key" ON "Settings"("key");

CREATE TABLE IF NOT EXISTS "CleanupRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "libraryId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minAgeDays" INTEGER NOT NULL DEFAULT 30,
    "maxDaysSinceWatched" INTEGER,
    "protectNeverWatched" BOOLEAN NOT NULL DEFAULT false,
    "protectInProgress" BOOLEAN NOT NULL DEFAULT true,
    "protectCurrentlyPlaying" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "CleanupReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "totalSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "executedAt" DATETIME,
    "triggeredBy" TEXT,
    "pauseRequested" BOOLEAN NOT NULL DEFAULT 0,
    "stopRequested" BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "CleanupReportItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "radarrId" INTEGER,
    "sonarrId" INTEGER,
    "plexRatingKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "addedAt" DATETIME NOT NULL,
    "lastWatchedAt" DATETIME,
    "watchCount" INTEGER NOT NULL DEFAULT 0,
    "fileSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "reasons" TEXT NOT NULL,
    "ruleName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "posterPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CleanupReportItem_reportId_fkey"
        FOREIGN KEY ("reportId") REFERENCES "CleanupReport" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "NotificationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationConfig_type_key" ON "NotificationConfig"("type");

CREATE TABLE IF NOT EXISTS "ScheduleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cronExpr" TEXT NOT NULL DEFAULT '0 2 * * *',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoDelete" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" DATETIME,
    "lastRunStatus" TEXT,
    "libraryScanEnabled" BOOLEAN NOT NULL DEFAULT false,
    "libraryScanCron" TEXT NOT NULL DEFAULT '0 * * * *',
    "libraryScanLastAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "LibraryCache" (
    "sectionId" TEXT NOT NULL PRIMARY KEY,
    "sectionJson" TEXT NOT NULL,
    "mediaJson" TEXT NOT NULL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanning" BOOLEAN NOT NULL DEFAULT false,
    "scanStartedAt" DATETIME
);

CREATE TABLE IF NOT EXISTS "AuthConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "secretKey" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS "PermanentExclusion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plexRatingKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "mediaType" TEXT NOT NULL,
    "posterPath" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PermanentExclusion_plexRatingKey_key"
    ON "PermanentExclusion"("plexRatingKey");
`

export function getDemoDbPath(): string {
  return path.resolve(process.cwd(), 'demo.db')
}

/**
 * Ensure demo.db exists and has all tables.
 * Uses better-sqlite3 directly — supports multi-statement exec().
 * Safe to call multiple times (all statements use IF NOT EXISTS).
 */
export function ensureDemoSchema(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require('better-sqlite3') as (path: string) => { exec: (sql: string) => void; close: () => void }
  const db = BetterSqlite3(getDemoDbPath())
  db.exec(DEMO_SCHEMA_SQL)
  db.close()
}

function createDemoPrismaClient(): PrismaClient {
  const dbPath = getDemoDbPath()
  const adapter = new PrismaBetterSqlite3({ url: dbPath })
  return new PrismaClient({ adapter })
}

const _global = globalThis as unknown as { _demoPrisma?: PrismaClient }
export const demoPrisma: PrismaClient = _global._demoPrisma ?? createDemoPrismaClient()
if (process.env.NODE_ENV !== 'production') _global._demoPrisma = demoPrisma
