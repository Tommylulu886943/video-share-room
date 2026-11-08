// Real end-to-end check of the transcript pipeline against live YouTube (and the
// real LLM / ASR if configured), using a throwaway SQLite DB — your data is untouched.
//
//   npx tsx scripts/transcript-live-check.ts "https://www.youtube.com/watch?v=S9qKB6pLLlY&t=121s"
//
// Prints the actual source, language, segment count and the lines around the
// link's t= position (default 121s). t= is only used to choose what to print;
// it is never added to transcript times.
import "dotenv/config";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { parseVideoRef } from "../src/lib/sources";
import { formatTimestamp } from "../src/lib/transcript";

async function main() {
  const url = process.argv[2] ?? "https://www.youtube.com/watch?v=S9qKB6pLLlY&t=121s";
  const ref = parseVideoRef(url);
  if (!ref || ref.source !== "youtube") throw new Error(`not a YouTube URL: ${url}`);
  const tParam = new URL(url.startsWith("http") ? url : `https://youtu.be/${url}`).searchParams.get("t");
  const atMs = (tParam ? parseInt(tParam, 10) : 121) * 1000;

  const dir = mkdtempSync(path.join(tmpdir(), "transcript-live-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "live.db").replaceAll("\\", "/")}`;
  delete process.env.TURSO_DATABASE_URL;
  const sql = createClient({ url: process.env.DATABASE_URL });
  for (const name of readdirSync("prisma/migrations").filter((n) => /^\d/.test(n)).sort()) {
    await sql.executeMultiple(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  }
  sql.close();
  const { prisma } = await import("../src/lib/db");
  const jobs = await import("../src/lib/transcript-jobs");
  try {
    const tenant = await prisma.tenant.create({ data: { name: "Live check", slug: "live-check" } });
    const row = await prisma.video.create({
      data: { tenantId: tenant.id, source: "youtube", youtubeId: ref.id, title: "live check" },
    });
    const video = { id: row.id, source: row.source, youtubeId: row.youtubeId };
    const queue: (() => Promise<void>)[] = [];
    const started = Date.now();
    await jobs.requestTranscript(video, { translateTo: "zh-TW" }, (t) => void queue.push(t));
    while (queue.length) await queue.shift()!();
    const s = await jobs.getTranscriptState(video);

    console.log(`video: ${ref.id}  (platform id ${video.id})  elapsed ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(`ASR configured: ${s.asrConfigured}  LLM configured: ${s.llmConfigured}`);
    const tj = await prisma.transcriptJob.findFirst({ where: { videoId: video.id, kind: "transcript" } });
    console.log(`original: ${s.transcriptStatus}${s.transcriptJob?.errorCode ? ` [${s.transcriptJob.errorCode}] ${s.transcriptJob.errorMessage}` : ""}`);
    if (tj?.detail) console.log(`  detail: ${tj.detail}`);
    if (s.transcript) {
      const segs = s.transcript.segments;
      console.log(
        `  v${s.transcript.version} source=${s.transcript.source} language=${s.transcript.language} segments=${segs.length} ` +
          `span=${formatTimestamp(segs[0].start_ms)}–${formatTimestamp(segs[segs.length - 1].end_ms)}`,
      );
      const i = Math.max(0, segs.findIndex((x) => x.end_ms > atMs));
      const tr = new Map((s.translation?.segments ?? []).map((x) => [x.id, x.text]));
      console.log(`  around ${formatTimestamp(atMs)}:`);
      for (const x of segs.slice(Math.max(0, i - 2), i + 4)) {
        console.log(`    ${x.id} ${formatTimestamp(x.start_ms)} [${x.start_ms}–${x.end_ms}ms] ${x.text}`);
        if (tr.has(x.id)) console.log(`      → ${tr.get(x.id)}`);
      }
    }
    console.log(
      `translation: ${s.translationStatus}${s.translationJob?.errorCode ? ` [${s.translationJob.errorCode}] ${s.translationJob.errorMessage}` : ""}` +
        (s.translation ? ` (v${s.translation.transcriptVersion}, ${s.translation.segments.length} segments)` : ""),
    );
  } finally {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
