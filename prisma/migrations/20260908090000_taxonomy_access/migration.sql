ALTER TABLE "Category" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "Tag" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
CREATE TABLE "CategoryAccess" (
 "categoryId" TEXT NOT NULL, "membershipId" TEXT NOT NULL,
 PRIMARY KEY ("categoryId", "membershipId"),
 FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "TagAccess" (
 "tagId" TEXT NOT NULL, "membershipId" TEXT NOT NULL,
 PRIMARY KEY ("tagId", "membershipId"),
 FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
