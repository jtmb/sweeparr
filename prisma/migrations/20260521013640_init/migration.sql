-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CleanupRule" (
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

-- CreateTable
CREATE TABLE "CleanupReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "totalSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "executedAt" DATETIME,
    "triggeredBy" TEXT
);

-- CreateTable
CREATE TABLE "CleanupReportItem" (
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
    "status" TEXT NOT NULL DEFAULT 'pending',
    "posterPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CleanupReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CleanupReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScheduleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cronExpr" TEXT NOT NULL DEFAULT '0 2 * * *',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoDelete" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" DATETIME,
    "lastRunStatus" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_key_key" ON "Settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationConfig_type_key" ON "NotificationConfig"("type");
