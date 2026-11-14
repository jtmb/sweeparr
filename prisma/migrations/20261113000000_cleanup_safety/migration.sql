ALTER TABLE "CleanupReport" ADD COLUMN "allowPlexDeletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CleanupReportItem" ADD COLUMN "safetySnapshot" TEXT;
CREATE TABLE "CleanupExecutionLock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
