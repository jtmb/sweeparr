-- CreateTable
CREATE TABLE "AuthConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "secretKey" TEXT NOT NULL DEFAULT ''
);
