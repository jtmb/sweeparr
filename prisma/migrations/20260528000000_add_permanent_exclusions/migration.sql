-- CreateTable
CREATE TABLE "PermanentExclusion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plexRatingKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "mediaType" TEXT NOT NULL,
    "posterPath" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PermanentExclusion_plexRatingKey_key" ON "PermanentExclusion"("plexRatingKey");
