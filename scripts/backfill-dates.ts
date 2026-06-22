import "dotenv/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma/client";
import { extractDatePrefix } from "../src/lib/dates";

// One-off: for existing videos whose title starts with a YYMMDD date, move the
// date into recordedOn (if unset) and strip it from the title. Idempotent.
const tursoUrl = process.env.TURSO_DATABASE_URL;
const adapter = tursoUrl
  ? new PrismaLibSql({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
  : new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const videos = await prisma.video.findMany({
    select: { id: true, title: true, recordedOn: true },
  });
  let updated = 0;
  for (const v of videos) {
    const { recordedOn, title } = extractDatePrefix(v.title);
    if (!recordedOn || title === v.title) continue; // no date prefix found
    await prisma.video.update({
      where: { id: v.id },
      data: {
        title,
        // Only fill recordedOn if it isn't already set.
        recordedOn: v.recordedOn ?? recordedOn,
      },
    });
    updated++;
    console.log(`  ${v.title}  →  [${recordedOn.toISOString().slice(0, 10)}] ${title}`);
  }
  console.log(`Backfill complete. Updated ${updated}/${videos.length} videos.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
