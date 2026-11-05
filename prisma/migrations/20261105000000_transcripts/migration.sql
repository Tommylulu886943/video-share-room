-- CreateTable
CREATE TABLE "Transcript" (
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "sourceLang" TEXT,
    "kind" TEXT,
    "status" TEXT NOT NULL,
    "segments" TEXT NOT NULL DEFAULT '[]',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("source", "externalId", "lang")
);
