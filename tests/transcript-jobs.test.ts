// Integration tests for transcript/translation jobs against a real (temp) SQLite
// database. YouTube, ASR and the LLM are faked — these do NOT prove that real
// YouTube fetching works (see scripts/transcript-live-check.ts for that).
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import type { TenantContext } from "../src/lib/tenant";
import {
  toSegments,
  TranscriptError,
  type CaptionOutcome,
  type TranslatedSegment,
} from "../src/lib/transcript";
import type { TranslateBatchInput } from "../src/lib/transcript-translate";

const dir = mkdtempSync(path.join(tmpdir(), "transcript-jobs-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db").replaceAll("\\", "/")}`;
delete process.env.TURSO_DATABASE_URL;

type Db = typeof import("../src/lib/db");
type Jobs = typeof import("../src/lib/transcript-jobs");
let prisma: Db["prisma"];
let jobs: Jobs;
let tenantId = "";
let otherTenantId = "";

const queue: (() => Promise<void>)[] = [];
const schedule = (task: () => Promise<void>) => void queue.push(task);
async function drain() {
  while (queue.length) await queue.shift()!();
}

let fetchImpl: (id: string, lang: string | null) => Promise<CaptionOutcome>;
let fetchCalls: { id: string; lang: string | null }[] = [];
let asrOn = false;
let asrCalls: { id: string; lang: string | null }[] = [];
let asrImpl: (id: string, lang: string | null) => Promise<{ language: string; cues: { start_ms: number; dur_ms: number; text: string }[] }>;
let llmOn = true;
let translateImpl: (input: TranslateBatchInput) => Promise<TranslatedSegment[]>;
let translateCalls: string[][] = [];

const fakeTranslate = async (input: TranslateBatchInput) =>
  input.segments.map((s) => ({ id: s.id, text: `譯:${s.text}` }));

function captions(texts: string[], language = "ja", startMs = 121_200): CaptionOutcome {
  return {
    kind: "ok",
    source: "youtube_auto",
    language,
    basis: "original_audio",
    segments: toSegments(texts.map((text, i) => ({ start_ms: startMs + i * 1000, dur_ms: 900, text }))),
    available: [{ code: language, label: language, kinds: ["asr"] }],
  };
}

let ytCounter = 0;
async function newVideo(opts: { tenant?: string; visibility?: string } = {}) {
  const youtubeId = `vid${String(++ytCounter).padStart(8, "0")}`;
  const v = await prisma.video.create({
    data: {
      tenantId: opts.tenant ?? tenantId,
      source: "youtube",
      youtubeId,
      title: youtubeId,
      visibility: opts.visibility ?? "PUBLIC",
    },
  });
  return { id: v.id, source: v.source, youtubeId: v.youtubeId };
}

function resetFakes() {
  queue.length = 0;
  fetchCalls = [];
  asrCalls = [];
  translateCalls = [];
  asrOn = false;
  llmOn = true;
  fetchImpl = async () => captions(["一本目", "小手", "面"]);
  asrImpl = async () => ({ language: "ja", cues: [{ start_ms: 2000, dur_ms: 1000, text: "音声" }] });
  translateImpl = fakeTranslate;
}

before(async () => {
  const sql = createClient({ url: process.env.DATABASE_URL! });
  for (const name of readdirSync("prisma/migrations").filter((n) => /^\d/.test(n)).sort()) {
    await sql.executeMultiple(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  }
  sql.close();
  ({ prisma } = await import("../src/lib/db"));
  jobs = await import("../src/lib/transcript-jobs");
  const d = jobs.transcriptDeps;
  d.sleep = async () => {};
  d.fetchCaptions = (id, lang) => {
    fetchCalls.push({ id, lang });
    return fetchImpl(id, lang);
  };
  d.asrConfigured = () => asrOn;
  d.runAsr = (id, lang) => {
    asrCalls.push({ id, lang });
    return asrImpl(id, lang);
  };
  d.llmConfigured = () => llmOn;
  d.translateModel = () => "fake-model";
  d.translateBatch = (input) => {
    translateCalls.push(input.segments.map((s) => s.id));
    return translateImpl(input);
  };
  tenantId = (await prisma.tenant.create({ data: { name: "Club", slug: "club" } })).id;
  otherTenantId = (await prisma.tenant.create({ data: { name: "Other", slug: "other" } })).id;
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test("one click fetches the original, then translates; saved on the right video and readable later", async () => {
  resetFakes();
  const video = await newVideo();
  const bystander = await newVideo();
  await jobs.requestTranscript(video, { translateTo: "zh-TW" }, schedule);
  await jobs.requestTranscript(video, { translateTo: "zh-TW" }, schedule); // double click
  assert.equal(queue.length, 1);
  assert.equal(await prisma.transcriptJob.count({ where: { videoId: video.id } }), 1);
  assert.equal((await jobs.getTranscriptState(video)).transcriptStatus, "queued");

  await drain();
  const s = await jobs.getTranscriptState(video);
  assert.equal(s.transcriptStatus, "completed");
  assert.equal(s.translationStatus, "completed");
  assert.equal(s.transcript?.version, 1);
  assert.equal(s.transcript?.source, "youtube_auto");
  assert.equal(s.transcript?.language, "ja");
  assert.deepEqual(
    s.transcript?.segments.map((x) => [x.id, x.start_ms, x.end_ms]),
    [
      ["seg-0001", 121_200, 122_100],
      ["seg-0002", 122_200, 123_100],
      ["seg-0003", 123_200, 124_100],
    ],
  );
  assert.equal(s.translation?.transcriptVersion, 1);
  assert.deepEqual(s.translation?.segments, [
    { id: "seg-0001", text: "譯:一本目" },
    { id: "seg-0002", text: "譯:小手" },
    { id: "seg-0003", text: "譯:面" },
  ]);
  assert.deepEqual(fetchCalls, [{ id: video.youtubeId, lang: null }]);
  assert.equal((await jobs.getTranscriptState(bystander)).transcript, null);

  // Asking again reuses both results — no new work.
  await jobs.requestTranscript(video, { translateTo: "zh-TW" }, schedule);
  await jobs.requestTranslation(video, { transcriptVersion: 1 }, schedule);
  assert.equal(queue.length, 0);
  assert.equal(fetchCalls.length, 1);
  assert.equal(translateCalls.length, 1);
});

test("concurrent identical requests share one job", async () => {
  resetFakes();
  const video = await newVideo();
  await Promise.all(Array.from({ length: 5 }, () => jobs.requestTranscript(video, {}, schedule)));
  assert.equal(await prisma.transcriptJob.count({ where: { videoId: video.id } }), 1);
  assert.equal(queue.length, 1);
  await drain();
  assert.equal(fetchCalls.length, 1);
});

test("captions are used when suitable; ASR only without them; failures are reported distinctly", async () => {
  resetFakes();
  asrOn = true;
  const withCaptions = await newVideo();
  await jobs.requestTranscript(withCaptions, {}, schedule);
  await drain();
  assert.equal(asrCalls.length, 0);
  assert.equal((await jobs.getTranscriptState(withCaptions)).transcript?.source, "youtube_auto");

  // No captions at all + ASR available → ASR transcript on the original timeline.
  fetchImpl = async () => ({ kind: "none", reason: "no_captions", language: "ja", available: [] });
  const noCaptions = await newVideo();
  await jobs.requestTranscript(noCaptions, {}, schedule);
  await drain();
  assert.deepEqual(asrCalls, [{ id: noCaptions.youtubeId, lang: "ja" }]);
  const asrState = await jobs.getTranscriptState(noCaptions);
  assert.equal(asrState.transcript?.source, "asr");
  assert.deepEqual(asrState.transcript?.segments, [{ id: "seg-0001", start_ms: 2000, end_ms: 3000, text: "音声" }]);

  // No captions + ASR not configured → "no_captions", not a fake result.
  asrOn = false;
  const noAsr = await newVideo();
  await jobs.requestTranscript(noAsr, {}, schedule);
  await drain();
  let s = await jobs.getTranscriptState(noAsr);
  assert.equal(s.transcript, null);
  assert.equal(s.transcriptStatus, "failed");
  assert.equal(s.transcriptJob?.errorCode, "no_captions");
  assert.match(s.transcriptJob?.errorMessage ?? "", /語音辨識/);

  // Audio not obtainable → audio_unavailable.
  asrOn = true;
  asrImpl = async () => {
    throw new TranscriptError("audio_unavailable", "無法取得影片音訊");
  };
  const noAudio = await newVideo();
  await jobs.requestTranscript(noAudio, {}, schedule);
  await drain();
  s = await jobs.getTranscriptState(noAudio);
  assert.equal(s.transcriptJob?.errorCode, "audio_unavailable");
  assert.equal(s.transcript, null);

  // Restricted source is its own error and never falls through to ASR.
  asrCalls = [];
  fetchImpl = async () => {
    throw new TranscriptError("source_restricted", "YouTube 限制存取（LOGIN_REQUIRED）");
  };
  const restricted = await newVideo();
  await jobs.requestTranscript(restricted, {}, schedule);
  await drain();
  s = await jobs.getTranscriptState(restricted);
  assert.equal(s.transcriptJob?.errorCode, "source_restricted");
  assert.equal(asrCalls.length, 0);

  // Several caption languages, original unknown → ask; offer the languages.
  fetchImpl = async () => ({
    kind: "ambiguous",
    available: [
      { code: "en", label: "English", kinds: ["manual"] },
      { code: "ja", label: "Japanese", kinds: ["manual"] },
    ],
  });
  const ambiguous = await newVideo();
  await jobs.requestTranscript(ambiguous, {}, schedule);
  await drain();
  s = await jobs.getTranscriptState(ambiguous);
  assert.equal(s.transcriptJob?.errorCode, "language_ambiguous");
  assert.deepEqual(s.availableLanguages.map((l) => l.code), ["en", "ja"]);
  // Choosing a language is a different request (not merged with the failed auto one).
  fetchImpl = async (_id, lang) => captions(["hello"], lang ?? "??");
  await jobs.requestTranscript(ambiguous, { language: "ja" }, schedule);
  await drain();
  s = await jobs.getTranscriptState(ambiguous);
  assert.equal(s.transcript?.language, "ja");
  await assert.rejects(
    jobs.requestTranscript(ambiguous, { language: "ja;rm" }, schedule),
    (e: { status?: number }) => e.status === 400,
  );
});

test("transient failures are retried a bounded number of times", async () => {
  resetFakes();
  let n = 0;
  fetchImpl = async () => {
    if (++n === 1) throw new TranscriptError("fetch_failed", "temporary", true);
    return captions(["ok"]);
  };
  const flaky = await newVideo();
  await jobs.requestTranscript(flaky, {}, schedule);
  await drain();
  const s = await jobs.getTranscriptState(flaky);
  assert.equal(s.transcriptStatus, "completed");
  assert.equal(s.transcriptJob?.attempts, 2);

  fetchCalls = [];
  fetchImpl = async () => {
    throw new TranscriptError("fetch_failed", "down", true);
  };
  const down = await newVideo();
  await jobs.requestTranscript(down, {}, schedule);
  await drain();
  const d = await jobs.getTranscriptState(down);
  assert.equal(d.transcriptStatus, "failed");
  assert.equal(d.transcriptJob?.errorCode, "fetch_failed");
  assert.equal(fetchCalls.length, jobs.JOB_TIMING.maxAttempts);
});

test("translation: invalid replies never pass as complete, the original is untouched, retry resumes", async () => {
  resetFakes();
  fetchImpl = async () => captions(["a", "b", "c", "d", "e"]);
  // Always drops seg-0003 → bisected down to that one segment, then fails.
  translateImpl = async (input) =>
    input.segments.filter((x) => x.id !== "seg-0003").map((x) => ({ id: x.id, text: `T${x.text}` }));
  const video = await newVideo();
  await jobs.requestTranscript(video, { translateTo: "zh-TW" }, schedule);
  await drain();
  let s = await jobs.getTranscriptState(video);
  assert.equal(s.transcriptStatus, "completed");
  assert.equal(s.transcript?.segments.length, 5);
  assert.equal(s.translation, null);
  assert.equal(s.translationStatus, "failed");
  assert.equal(s.translationJob?.errorCode, "translation_invalid");
  assert.deepEqual(s.translationJob?.progress, { done: 4, total: 5 });

  // Fixed model; retry only sends the missing segment.
  translateCalls = [];
  translateImpl = async (input) => input.segments.map((x) => ({ id: x.id, text: `T${x.text}` }));
  await jobs.requestTranslation(video, { transcriptVersion: 1 }, schedule);
  await drain();
  assert.deepEqual(translateCalls, [["seg-0003"]]);
  s = await jobs.getTranscriptState(video);
  assert.equal(s.translationStatus, "completed");
  assert.deepEqual(
    s.translation?.segments.map((x) => x.text),
    ["Ta", "Tb", "Tc", "Td", "Te"],
  );

  // Duplicate / invented ids are rejected too (then succeed after one retry).
  let calls = 0;
  translateImpl = async (input) => {
    calls++;
    const out = input.segments.map((x) => ({ id: x.id, text: `U${x.text}` }));
    return calls === 1 ? [...out, { id: "seg-9999", text: "invented" }] : out;
  };
  const v2 = await newVideo();
  await jobs.requestTranscript(v2, { translateTo: "zh-TW" }, schedule);
  await drain();
  s = await jobs.getTranscriptState(v2);
  assert.equal(s.translationStatus, "completed");
  assert.ok(s.translation?.segments.every((x) => x.text.startsWith("U")));
  assert.equal(s.translation?.segments.length, 5);
});

test("missing LLM credentials: original still works, translation reports missing configuration", async () => {
  resetFakes();
  llmOn = false;
  const video = await newVideo();
  await jobs.requestTranscript(video, { translateTo: "zh-TW" }, schedule);
  await drain();
  const s = await jobs.getTranscriptState(video);
  assert.equal(s.llmConfigured, false);
  assert.equal(s.transcriptStatus, "completed");
  assert.equal(s.translationStatus, "failed");
  assert.equal(s.translationJob?.errorCode, "llm_not_configured");
  assert.equal(translateCalls.length, 0);
});

test("Traditional Chinese originals need no translation", async () => {
  resetFakes();
  fetchImpl = async () => captions(["你好"], "zh-TW");
  const video = await newVideo();
  await jobs.requestTranscript(video, { translateTo: "zh-TW" }, schedule);
  await drain();
  const s = await jobs.getTranscriptState(video);
  assert.equal(s.translationNeeded, false);
  assert.equal(s.translationJob, null);
  assert.equal(translateCalls.length, 0);
});

test("refreshing the original creates a new version; old translations are not shown for it", async () => {
  resetFakes();
  const video = await newVideo();
  await jobs.requestTranscript(video, { translateTo: "zh-TW" }, schedule);
  await drain();
  const v1 = await jobs.getTranscriptState(video);
  assert.equal(v1.translation?.transcriptVersion, 1);

  // Same content → same version (translation stays valid).
  await jobs.requestTranscript(video, { force: true }, schedule);
  await drain();
  assert.equal((await jobs.getTranscriptState(video)).transcript?.version, 1);
  assert.equal((await jobs.getTranscriptState(video)).translation?.transcriptVersion, 1);

  // Different content → version 2; v1's translation is not presented as v2's.
  fetchImpl = async () => captions(["一本目", "胴"]);
  await jobs.requestTranscript(video, { force: true }, schedule);
  await drain();
  let s = await jobs.getTranscriptState(video);
  assert.equal(s.transcript?.version, 2);
  assert.equal(s.translation, null);
  assert.equal(s.translationStatus, "not_requested");
  assert.equal(await prisma.videoTranscriptTranslation.count({ where: { transcript: { videoId: video.id } } }), 1);
  await assert.rejects(
    jobs.requestTranslation(video, { transcriptVersion: 1 }, schedule),
    (e: { status?: number }) => e.status === 409,
  );

  // A failed refresh keeps the last good version visible.
  fetchImpl = async () => {
    throw new TranscriptError("fetch_failed", "bad", false);
  };
  await jobs.requestTranscript(video, { force: true }, schedule);
  await drain();
  s = await jobs.getTranscriptState(video);
  assert.equal(s.transcriptStatus, "failed");
  assert.equal(s.transcript?.version, 2);
  assert.equal(s.transcript?.segments[1].text, "胴");
});

test("late results never land on a video whose source changed or that was deleted", async () => {
  resetFakes();
  const changed = await newVideo();
  fetchImpl = async () => {
    await prisma.video.update({ where: { id: changed.id }, data: { youtubeId: "zzzzzzzzzzz" } });
    return captions(["old source"]);
  };
  await jobs.requestTranscript(changed, {}, schedule);
  await drain();
  assert.equal(await prisma.videoTranscript.count({ where: { videoId: changed.id } }), 0);
  const job = await prisma.transcriptJob.findFirst({ where: { videoId: changed.id } });
  assert.equal(job?.status, "failed");
  assert.equal(job?.errorCode, "video_changed");
  // The page now shows the new source's (empty) state, not the old one.
  assert.equal(
    (await jobs.getTranscriptState({ ...changed, youtubeId: "zzzzzzzzzzz" })).transcriptJob,
    null,
  );

  const deleted = await newVideo();
  fetchImpl = async () => {
    await prisma.video.delete({ where: { id: deleted.id } });
    return captions(["ghost"]);
  };
  await jobs.requestTranscript(deleted, {}, schedule);
  await drain();
  assert.equal(await prisma.videoTranscript.count({ where: { videoId: deleted.id } }), 0);
  assert.equal(await prisma.transcriptJob.count({ where: { videoId: deleted.id } }), 0);

  // Translation finishing after a source change is discarded as well.
  resetFakes();
  const xl = await newVideo();
  await jobs.requestTranscript(xl, {}, schedule);
  await drain();
  translateImpl = async (input) => {
    await prisma.video.update({ where: { id: xl.id }, data: { youtubeId: "yyyyyyyyyyy" } });
    return fakeTranslate(input);
  };
  await jobs.requestTranslation(xl, { transcriptVersion: 1 }, schedule);
  await drain();
  assert.equal(await prisma.videoTranscriptTranslation.count({ where: { transcript: { videoId: xl.id } } }), 0);
});

test("a worker whose lease expired cannot overwrite the newer worker's result", async () => {
  resetFakes();
  const video = await newVideo();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const inFetch = new Promise<void>((r) => (entered = r));
  fetchImpl = async () => {
    entered();
    await gate;
    return captions(["stale worker"]);
  };
  await jobs.requestTranscript(video, {}, schedule);
  const slow = queue.shift()!();
  await inFetch;
  const job = await prisma.transcriptJob.findFirstOrThrow({ where: { videoId: video.id } });
  assert.equal(job.status, "processing");
  // Simulate the first worker hanging past its lease; a second worker takes over.
  await prisma.transcriptJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
  fetchImpl = async () => captions(["fresh worker"]);
  await jobs.runJob(job.id);
  release();
  await slow;
  const rows = await prisma.videoTranscript.findMany({ where: { videoId: video.id } });
  assert.equal(rows.length, 1);
  assert.match(rows[0].segments, /fresh worker/);
  assert.equal((await prisma.transcriptJob.findUniqueOrThrow({ where: { id: job.id } })).status, "completed");
});

test("an older request finishing last does not replace a newer published result", async () => {
  resetFakes();
  const video = await newVideo();
  fetchImpl = async (_id, lang) => captions([`text in ${lang}`], lang ?? "ja");
  await jobs.requestTranscript(video, { language: "ja" }, schedule);
  const older = queue.shift()!;
  await new Promise((r) => setTimeout(r, 5));
  await jobs.requestTranscript(video, { language: "en", force: true }, schedule);
  const newer = queue.shift()!;
  await newer();
  await older();
  const s = await jobs.getTranscriptState(video);
  assert.equal(s.transcript?.language, "en");
  assert.equal(s.transcript?.version, 1);
  const olderJob = await prisma.transcriptJob.findFirstOrThrow({ where: { videoId: video.id, language: "ja" } });
  assert.equal(olderJob.errorCode, "superseded");
});

test("abandoned jobs are resumed when the status is read, and give up after the attempt limit", async () => {
  resetFakes();
  const video = await newVideo();
  await jobs.requestTranscript(video, {}, schedule);
  queue.length = 0; // the background task was lost (e.g. function killed)
  const job = await prisma.transcriptJob.findFirstOrThrow({ where: { videoId: video.id } });
  await prisma.transcriptJob.update({ where: { id: job.id }, data: { updatedAt: new Date(Date.now() - 10 * 60_000) } });
  await jobs.getTranscriptState(video, schedule);
  assert.equal(queue.length, 1);
  await drain();
  assert.equal((await jobs.getTranscriptState(video)).transcriptStatus, "completed");

  const stuck = await newVideo();
  await jobs.requestTranscript(stuck, {}, schedule);
  queue.length = 0;
  const sj = await prisma.transcriptJob.findFirstOrThrow({ where: { videoId: stuck.id } });
  await prisma.transcriptJob.update({
    where: { id: sj.id },
    data: { status: "processing", attempts: jobs.JOB_TIMING.maxAttempts, leaseUntil: new Date(Date.now() - 1000) },
  });
  const s = await jobs.getTranscriptState(stuck, schedule);
  assert.equal(queue.length, 0);
  assert.equal(s.transcriptStatus, "failed");
  assert.equal(s.transcriptJob?.errorCode, "timeout");
  // A new click starts fresh.
  await jobs.requestTranscript(stuck, {}, schedule);
  await drain();
  assert.equal((await jobs.getTranscriptState(stuck)).transcriptStatus, "completed");
});

test("access: other tenants and non-allowed members cannot reach a video or its transcript", async () => {
  resetFakes();
  const users = [];
  for (let i = 0; i < 3; i++) {
    users.push(
      await prisma.user.create({ data: { username: `u${i}`, email: `u${i}@test.invalid`, passwordHash: "x" } }),
    );
  }
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const other = await prisma.tenant.findUniqueOrThrow({ where: { id: otherTenantId } });
  const alice = await prisma.membership.create({ data: { userId: users[0].id, tenantId, name: "A", level: "", status: "APPROVED" } });
  const bob = await prisma.membership.create({ data: { userId: users[1].id, tenantId, name: "B", level: "", status: "APPROVED" } });
  const outsider = await prisma.membership.create({ data: { userId: users[2].id, tenantId: otherTenantId, name: "O", level: "", status: "APPROVED" } });
  const ctx = (t: typeof tenant, id: string, isAdmin = false) =>
    ({ tenant: t, membership: { id }, isAdmin, isMember: true, canUpload: isAdmin }) as unknown as TenantContext;

  const restricted = await newVideo({ visibility: "RESTRICTED" });
  await prisma.videoAccess.create({ data: { videoId: restricted.id, membershipId: alice.id } });
  await jobs.requestTranscript(restricted, { translateTo: "zh-TW" }, schedule);
  await drain();

  assert.equal((await jobs.findViewableVideo(ctx(tenant, alice.id), restricted.id))?.id, restricted.id);
  assert.equal(await jobs.findViewableVideo(ctx(tenant, bob.id), restricted.id), null);
  assert.equal(await jobs.findViewableVideo(ctx(other, outsider.id), restricted.id), null);
  assert.equal(await jobs.findViewableVideo(ctx(other, outsider.id, true), restricted.id), null); // admin of another club
  assert.equal((await jobs.findViewableVideo(ctx(tenant, bob.id, true), restricted.id))?.id, restricted.id);

  // Another club collecting the same YouTube video gets its own, separate data.
  const otherCopy = await prisma.video.create({
    data: { tenantId: otherTenantId, source: "youtube", youtubeId: restricted.youtubeId, title: "copy" },
  });
  const copyState = await jobs.getTranscriptState({ id: otherCopy.id, source: "youtube", youtubeId: otherCopy.youtubeId });
  assert.equal(copyState.transcript, null);
  assert.equal(copyState.translation, null);
});
