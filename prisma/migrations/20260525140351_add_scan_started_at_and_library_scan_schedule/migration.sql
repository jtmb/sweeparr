-- AlterTable
ALTER TABLE "LibraryCache" ADD COLUMN "scanStartedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduleConfig" (
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
INSERT INTO "new_ScheduleConfig" ("autoDelete", "cronExpr", "enabled", "id", "lastRunAt", "lastRunStatus", "updatedAt") SELECT "autoDelete", "cronExpr", "enabled", "id", "lastRunAt", "lastRunStatus", "updatedAt" FROM "ScheduleConfig";
DROP TABLE "ScheduleConfig";
ALTER TABLE "new_ScheduleConfig" RENAME TO "ScheduleConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
