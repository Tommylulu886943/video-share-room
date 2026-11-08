-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Transcript";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "VideoTranscript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "segments" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoTranscript_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VideoTranscriptTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transcriptId" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "segments" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoTranscriptTranslation_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "VideoTranscript" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranscriptJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "activeKey" TEXT,
    "youtubeVideoId" TEXT NOT NULL,
    "language" TEXT,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "thenTranslate" TEXT,
    "transcriptId" TEXT,
    "targetLanguage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" DATETIME,
    "progress" TEXT,
    "progressDone" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "resultId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "detail" TEXT,
    "requestedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    CONSTRAINT "TranscriptJob_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VideoTranscript_videoId_youtubeVideoId_idx" ON "VideoTranscript"("videoId", "youtubeVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoTranscript_videoId_version_key" ON "VideoTranscript"("videoId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "VideoTranscriptTranslation_transcriptId_targetLanguage_key" ON "VideoTranscriptTranslation"("transcriptId", "targetLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptJob_activeKey_key" ON "TranscriptJob"("activeKey");

-- CreateIndex
CREATE INDEX "TranscriptJob_videoId_kind_createdAt_idx" ON "TranscriptJob"("videoId", "kind", "createdAt");

