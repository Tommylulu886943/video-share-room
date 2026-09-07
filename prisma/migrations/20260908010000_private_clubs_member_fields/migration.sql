ALTER TABLE "Tenant" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "memberFields" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Membership" ADD COLUMN "attributes" TEXT NOT NULL DEFAULT '{}';
-- Keep existing clubs' rank field and values; new clubs default to no fields.
UPDATE "Tenant" SET "memberFields" = '[{"id":"level","label":"級數","required":true}]';
CREATE TABLE "Invitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "attributes" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_tenantId_userId_idx" ON "Invitation"("tenantId", "userId");
