-- CreateTable
CREATE TABLE "LibraryCache" (
    "sectionId" TEXT NOT NULL PRIMARY KEY,
    "sectionJson" TEXT NOT NULL,
    "mediaJson" TEXT NOT NULL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanning" BOOLEAN NOT NULL DEFAULT false
);
