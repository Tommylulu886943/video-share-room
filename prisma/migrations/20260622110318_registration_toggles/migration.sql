-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL DEFAULT '#2563eb',
    "brandLogo" TEXT,
    "requireEmailVerification" BOOLEAN NOT NULL DEFAULT false,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Tenant" ("brandColor", "brandLogo", "createdAt", "id", "name", "slug") SELECT "brandColor", "brandLogo", "createdAt", "id", "name", "slug" FROM "Tenant";
DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
