-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'youtube',
    "youtubeId" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "recordedOn" DATETIME,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "categoryId" TEXT,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Video_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Video_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Video_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("categoryId", "createdAt", "id", "notes", "recordedOn", "tenantId", "title", "uploadedById", "visibility", "youtubeId") SELECT "categoryId", "createdAt", "id", "notes", "recordedOn", "tenantId", "title", "uploadedById", "visibility", "youtubeId" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE INDEX "Video_tenantId_visibility_idx" ON "Video"("tenantId", "visibility");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
