// Transcript + translation jobs for platform videos.
//
// Jobs are rows in TranscriptJob and run in the background (the API schedules
// them with Next's `after()`). Guarantees:
//  - One live job per dedupe key (`activeKey` is unique while queued/processing).
//  - A job holds a lease (token + expiry, renewed by heartbeat); only the lease
//    holder can save progress or publish. Lost/expired leases can be reclaimed,
//    with a bounded number of attempts.
//  - Publishing re-checks, in one transaction, that the video still exists and
//    still points at the same YouTube id, that the job is still the live one,
//    and that no newer request already published — stale work never overwrites.
//  - Content is versioned and immutable; a failed refresh never removes the
//    previous good result, and a translation is bound to one transcript version.
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { viewableVideoWhere } from "@/lib/access";
import type { TenantContext } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";
import type { TranscriptJob, VideoTranscript } from "@/generated/prisma/client";
import {
  assembleTranslation,
  batchSegments,
  fetchYouTubeCaptions,
  isAlreadyTarget,
  normalizeLanguage,
  sameLanguage,
  toSegments,
  TRANSLATE_TARGET,
  TRANSLATE_TARGETS,
  TranscriptError,
  validateTranslationBatch,
  type JobStatus,
  type LanguageOption,
  type TranscriptSegment,
  type TranscriptSource,
  type TranslatedSegment,
} from "@/lib/transcript";
import { youtubeAuth, youtubeFetch } from "@/lib/youtube-fetch";
import { asrConfigured, runAsr } from "@/lib/transcript-asr";
import { llmConfigured, translateBatch, translateModel, translationBatchLimits } from "@/lib/transcript-translate";

/** Replaceable I/O (tests swap these for fakes). */
export const transcriptDeps = {
  fetchCaptions: (id: string, lang: string | null) =>
    fetchYouTubeCaptions(id, lang, { fetchImpl: youtubeFetch(), auth: youtubeAuth() }),
  runAsr,
  asrConfigured,
  translateBatch,
  llmConfigured,
  translateModel,
  translationBatchLimits,
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

export const JOB_TIMING = {
  leaseMs: 3 * 60_000,
  heartbeatMs: 30_000,
  /** A queued job nobody picked up for this long is considered abandoned. */
  queuedStaleMs: 2 * 60_000,
  maxAttempts: 3,
  translateConcurrency: 3,
};

/**
 * Publishing does 5–6 round-trips inside one interactive transaction; over
 * Turso's HTTP driver that can exceed Prisma's 5 s default and fail (P2028) a
 * result that was already in hand — forcing a needless re-fetch/re-translate.
 */
const TX_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

/** Runs a task after the response (route handlers pass Next's `after`). */
export type Schedule = (task: () => Promise<void>) => void;

export class TranscriptRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

class LeaseLostError extends Error {}

export interface VideoRef {
  id: string;
  source: string;
  youtubeId: string;
}

const ACTIVE: JobStatus[] = ["queued", "processing"];

/**
 * The video, if `ctx` may view it (same rules as the video page). All transcript
 * reads and writes start from this platform id — never from a bare YouTube id.
 */
export function findViewableVideo(ctx: TenantContext, id: string): Promise<VideoRef | null> {
  return prisma.video.findFirst({
    where: { AND: [{ id }, viewableVideoWhere(ctx)] },
    select: { id: true, source: true, youtubeId: true },
  });
}

// -------------------------------------------------------------- state ------

export interface JobView {
  id: string;
  status: JobStatus;
  errorCode: string | null;
  errorMessage: string | null;
  language: string | null;
  targetLanguage: string | null;
  progress: { done: number; total: number } | null;
  attempts: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface TranscriptState {
  videoId: string;
  youtubeVideoId: string;
  transcript: {
    version: number;
    source: TranscriptSource;
    language: string;
    createdAt: string;
    segments: TranscriptSegment[];
  } | null;
  translation: {
    transcriptVersion: number;
    targetLanguage: string;
    createdAt: string;
    segments: TranslatedSegment[];
  } | null;
  /** False when the original is already in the target language/script. */
  translationNeeded: boolean;
  transcriptStatus: JobStatus | "not_requested";
  translationStatus: JobStatus | "not_requested";
  transcriptJob: JobView | null;
  translationJob: JobView | null;
  availableLanguages: LanguageOption[];
  llmConfigured: boolean;
  asrConfigured: boolean;
}

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function jobView(j: TranscriptJob): JobView {
  return {
    id: j.id,
    status: j.status as JobStatus,
    errorCode: j.errorCode,
    errorMessage: j.errorMessage,
    language: j.language,
    targetLanguage: j.targetLanguage,
    progress: j.kind === "translation" && j.progressTotal ? { done: j.progressDone, total: j.progressTotal } : null,
    attempts: j.attempts,
    createdAt: j.createdAt.toISOString(),
    finishedAt: j.finishedAt?.toISOString() ?? null,
  };
}

function isStale(j: TranscriptJob, now = Date.now()): boolean {
  if (j.status === "queued") return now - j.updatedAt.getTime() > JOB_TIMING.queuedStaleMs;
  if (j.status === "processing") return !j.leaseUntil || j.leaseUntil.getTime() < now;
  return false;
}

function currentTranscript(video: VideoRef) {
  return prisma.videoTranscript.findFirst({
    where: { videoId: video.id, youtubeVideoId: video.youtubeId },
    orderBy: { version: "desc" },
  });
}

/** Mark a job failed if it's still in the state we observed (lease-checked when a token is given). */
async function failJob(
  job: Pick<TranscriptJob, "id">,
  token: string | null,
  e: TranscriptError,
  observed?: Pick<TranscriptJob, "status" | "leaseToken">,
): Promise<void> {
  await prisma.transcriptJob.updateMany({
    where: {
      id: job.id,
      status: observed ? observed.status : { in: ACTIVE },
      ...(token !== null ? { leaseToken: token } : observed ? { leaseToken: observed.leaseToken } : {}),
    },
    data: {
      status: "failed",
      activeKey: null,
      leaseToken: null,
      leaseUntil: null,
      errorCode: e.code,
      errorMessage: e.message,
      ...(e.detail ? { detail: JSON.stringify(e.detail) } : {}),
      finishedAt: new Date(),
    },
  });
}

/** Resume or retire jobs whose worker died (e.g. the serverless function timed out). */
async function recoverStale(job: TranscriptJob, schedule?: Schedule): Promise<boolean> {
  if (!ACTIVE.includes(job.status as JobStatus) || !isStale(job)) return false;
  if (job.attempts >= JOB_TIMING.maxAttempts) {
    await failJob(job, null, new TranscriptError("timeout", "處理逾時，請重試"), job);
    return true;
  }
  schedule?.(() => runJob(job.id));
  return false;
}

/** Everything the video page needs: published content plus the latest job of each kind. */
export async function getTranscriptState(video: VideoRef, schedule?: Schedule): Promise<TranscriptState> {
  const transcript = await currentTranscript(video);
  const latestTranscriptJob = () =>
    prisma.transcriptJob.findFirst({
      where: { videoId: video.id, kind: "transcript", youtubeVideoId: video.youtubeId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  const latestTranslationJob = () =>
    transcript
      ? prisma.transcriptJob.findFirst({
          where: { videoId: video.id, kind: "translation", transcriptId: transcript.id, targetLanguage: TRANSLATE_TARGET },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : Promise.resolve(null);
  let tJob = await latestTranscriptJob();
  let xJob = await latestTranslationJob();
  if (tJob && (await recoverStale(tJob, schedule))) tJob = await latestTranscriptJob();
  if (xJob && (await recoverStale(xJob, schedule))) xJob = await latestTranslationJob();

  const translation = transcript
    ? await prisma.videoTranscriptTranslation.findUnique({
        where: { transcriptId_targetLanguage: { transcriptId: transcript.id, targetLanguage: TRANSLATE_TARGET } },
      })
    : null;
  const lastDetail = parseJson<{ available?: LanguageOption[] }>(tJob?.detail, {});
  return {
    videoId: video.id,
    youtubeVideoId: video.youtubeId,
    transcript: transcript
      ? {
          version: transcript.version,
          source: transcript.source as TranscriptSource,
          language: transcript.language,
          createdAt: transcript.createdAt.toISOString(),
          segments: parseJson<TranscriptSegment[]>(transcript.segments, []),
        }
      : null,
    translation:
      transcript && translation
        ? {
            transcriptVersion: transcript.version,
            targetLanguage: translation.targetLanguage,
            createdAt: translation.createdAt.toISOString(),
            segments: parseJson<TranslatedSegment[]>(translation.segments, []),
          }
        : null,
    translationNeeded: transcript ? !isAlreadyTarget(transcript.language, TRANSLATE_TARGET) : true,
    transcriptStatus: (tJob?.status as JobStatus) ?? (transcript ? "completed" : "not_requested"),
    translationStatus: (xJob?.status as JobStatus) ?? (translation ? "completed" : "not_requested"),
    transcriptJob: tJob ? jobView(tJob) : null,
    translationJob: xJob ? jobView(xJob) : null,
    availableLanguages: lastDetail.available ?? [],
    llmConfigured: transcriptDeps.llmConfigured(),
    asrConfigured: transcriptDeps.asrConfigured(),
  };
}

// ------------------------------------------------------------ requests -----

type NewJob = Omit<Prisma.TranscriptJobUncheckedCreateInput, "dedupeKey" | "activeKey" | "status">;

/** Return the live job for `key`, or create one. Abandoned live jobs are retired first. */
async function enqueue(
  key: string,
  data: NewJob,
  onExisting?: (job: TranscriptJob) => Promise<void>,
): Promise<{ job: TranscriptJob; created: boolean }> {
  for (let i = 0; i < 4; i++) {
    const existing = await prisma.transcriptJob.findUnique({ where: { activeKey: key } });
    if (existing) {
      if (!isStale(existing)) {
        await onExisting?.(existing);
        return { job: existing, created: false };
      }
      await failJob(existing, null, new TranscriptError("timeout", "處理逾時，已依新的請求重新排程"), existing);
      continue;
    }
    try {
      const job = await prisma.transcriptJob.create({
        data: { ...data, dedupeKey: key, activeKey: key, status: "queued" },
      });
      return { job, created: true };
    } catch (err) {
      // Lost a race with a concurrent identical request → join its job.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("could not enqueue transcript job");
}

function assertYouTube(video: VideoRef) {
  if (video.source !== "youtube") throw new TranscriptRequestError(400, "此影片來源不支援逐字稿");
}

function parseTarget(input: unknown): string {
  const t = input == null ? TRANSLATE_TARGET : String(input);
  if (!(TRANSLATE_TARGETS as readonly string[]).includes(t)) throw new TranscriptRequestError(400, "不支援的翻譯語言");
  return t;
}

export interface TranscriptRequest {
  /** Source language; null/empty = detect. */
  language?: string | null;
  /** Fetch again even when a transcript exists. */
  force?: boolean;
  /** Translate after the original succeeds (or right away if it already exists). */
  translateTo?: string | null;
  userId?: string | null;
  /**
   * May this caller replace an existing transcript by asking for another
   * caption language? False for ordinary members: they get the stored version
   * (and its translation) regardless of `language`. Defaults to true.
   */
  canRefetch?: boolean;
}

/** "Get transcript" (optionally "…and translate"): reuse a valid result or queue a job. */
export async function requestTranscript(video: VideoRef, req: TranscriptRequest, schedule: Schedule): Promise<void> {
  assertYouTube(video);
  let language: string | null = null;
  if (req.language != null && req.language !== "") {
    language = normalizeLanguage(req.language);
    if (!language) throw new TranscriptRequestError(400, "語言代碼格式錯誤");
  }
  const translateTo = req.translateTo ? parseTarget(req.translateTo) : null;

  if (!req.force) {
    const current = await currentTranscript(video);
    // A different `language` from someone without refresh rights must not
    // publish a new version (which would hide the current translation and bill
    // a new one) — the `force` guard alone didn't cover this path.
    if (current && (!language || sameLanguage(current.language, language) || req.canRefetch === false)) {
      if (translateTo) await enqueueTranslation(video, current, translateTo, false, req.userId ?? null, schedule);
      return;
    }
  }

  const key = `transcript:${video.id}:${video.youtubeId}:${language?.toLowerCase() ?? "auto"}`;
  const { job, created } = await enqueue(
    key,
    {
      videoId: video.id,
      kind: "transcript",
      youtubeVideoId: video.youtubeId,
      language,
      force: Boolean(req.force),
      thenTranslate: translateTo,
      requestedById: req.userId ?? null,
    },
    async (existing) => {
      if (translateTo && !existing.thenTranslate) {
        await prisma.transcriptJob.updateMany({
          where: { id: existing.id, status: { in: ACTIVE } },
          data: { thenTranslate: translateTo },
        });
      }
    },
  );
  if (created) schedule(() => runJob(job.id));
}

export interface TranslationRequest {
  transcriptVersion: number;
  targetLanguage?: string | null;
  force?: boolean;
  userId?: string | null;
}

/** "Translate transcript": reuse the translation of that exact version or queue a job. */
export async function requestTranslation(video: VideoRef, req: TranslationRequest, schedule: Schedule): Promise<void> {
  assertYouTube(video);
  const target = parseTarget(req.targetLanguage);
  if (!Number.isInteger(req.transcriptVersion) || req.transcriptVersion < 1) {
    throw new TranscriptRequestError(400, "原文版本錯誤");
  }
  const transcript = await prisma.videoTranscript.findFirst({
    where: { videoId: video.id, youtubeVideoId: video.youtubeId, version: req.transcriptVersion },
  });
  const current = await currentTranscript(video);
  if (!transcript || current?.id !== transcript.id) {
    throw new TranscriptRequestError(409, "原文已更新，請重新整理後再翻譯");
  }
  await enqueueTranslation(video, transcript, target, Boolean(req.force), req.userId ?? null, schedule);
}

async function enqueueTranslation(
  video: VideoRef,
  transcript: VideoTranscript,
  target: string,
  force: boolean,
  userId: string | null,
  schedule: Schedule,
): Promise<void> {
  if (isAlreadyTarget(transcript.language, target)) return;
  if (!force) {
    const existing = await prisma.videoTranscriptTranslation.findUnique({
      where: { transcriptId_targetLanguage: { transcriptId: transcript.id, targetLanguage: target } },
      select: { id: true },
    });
    if (existing) return;
  }
  const key = `translation:${transcript.id}:${target}`;
  // Resume finished batches of an earlier failed/timed-out attempt on this exact version.
  const previous = force
    ? null
    : await prisma.transcriptJob.findFirst({
        where: { dedupeKey: key, status: "failed", progress: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { progress: true, progressDone: true },
      });
  const { job, created } = await enqueue(key, {
    videoId: video.id,
    kind: "translation",
    youtubeVideoId: transcript.youtubeVideoId,
    transcriptId: transcript.id,
    targetLanguage: target,
    force,
    progress: previous?.progress ?? null,
    progressDone: previous?.progressDone ?? 0,
    requestedById: userId,
  });
  if (created) schedule(() => runJob(job.id));
}

// -------------------------------------------------------------- runner -----

class Lease {
  lost = false;
  private timer: ReturnType<typeof setInterval>;
  constructor(
    readonly jobId: string,
    readonly token: string,
  ) {
    this.timer = setInterval(() => {
      this.renew().catch(() => {});
    }, JOB_TIMING.heartbeatMs);
  }
  private chain: Promise<void> = Promise.resolve();
  /**
   * Renew the lease (and optionally save progress). Calls are serialised so a
   * slower earlier write can't land after a newer one and roll progress back;
   * `extra` is read when the write actually runs, so callers pass a thunk for
   * values that keep changing.
   */
  renew(extra: Prisma.TranscriptJobUpdateManyMutationInput | (() => Prisma.TranscriptJobUpdateManyMutationInput) = {}): Promise<void> {
    const run = this.chain.then(async () => {
      const data = typeof extra === "function" ? extra() : extra;
      const r = await prisma.transcriptJob.updateMany({
        where: { id: this.jobId, leaseToken: this.token, status: "processing" },
        data: { ...data, leaseUntil: new Date(Date.now() + JOB_TIMING.leaseMs) },
      });
      if (!r.count) this.lost = true;
    });
    // The interval heartbeat has no caller to catch a transport error; an
    // unhandled rejection there would take the whole process down mid-job.
    this.chain = run.catch((err) => {
      console.warn("[transcript] lease renew failed:", err);
    });
    return run;
  }
  assert(): void {
    if (this.lost) throw new LeaseLostError();
  }
  stop(): void {
    clearInterval(this.timer);
  }
}

function asTranscriptError(err: unknown): TranscriptError {
  if (err instanceof TranscriptError) return err;
  console.error("[transcript] job error:", err);
  return new TranscriptError("internal_error", "處理時發生內部錯誤", true);
}

/** Claim and run a job (no-op if someone else holds a valid lease or it's finished). */
export async function runJob(jobId: string): Promise<void> {
  for (;;) {
    const token = randomUUID();
    const now = new Date();
    const claimed = await prisma.transcriptJob.updateMany({
      where: { id: jobId, OR: [{ status: "queued" }, { status: "processing", leaseUntil: { lt: now } }] },
      data: {
        status: "processing",
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + JOB_TIMING.leaseMs),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const job = await prisma.transcriptJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (job.attempts > JOB_TIMING.maxAttempts) {
      await failJob(job, token, new TranscriptError("timeout", "重試次數已用完，請稍後再試"));
      return;
    }
    const lease = new Lease(job.id, token);
    try {
      if (job.kind === "transcript") await processTranscript(job, lease);
      else await processTranslation(job, lease);
      return;
    } catch (err) {
      if (err instanceof LeaseLostError || lease.lost) return; // a newer worker owns it now
      const e = asTranscriptError(err);
      if (e.retryable && job.attempts < JOB_TIMING.maxAttempts) {
        const released = await prisma.transcriptJob.updateMany({
          where: { id: job.id, leaseToken: token, status: "processing" },
          data: { status: "queued", leaseToken: null, leaseUntil: null, errorCode: e.code, errorMessage: e.message },
        });
        if (!released.count) return;
        lease.stop();
        await transcriptDeps.sleep(1000 * 2 ** job.attempts);
        continue;
      }
      await failJob(job, token, e);
      return;
    } finally {
      lease.stop();
    }
  }
}

async function loadYouTubeVideo(videoId: string, expectedYoutubeId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, source: true, youtubeId: true },
  });
  if (!video) throw new TranscriptError("video_deleted", "影片已刪除");
  if (video.source !== "youtube" || video.youtubeId !== expectedYoutubeId) {
    throw new TranscriptError("video_changed", "影片來源已變更，此結果不會寫入");
  }
  return video;
}

function hashTranscript(source: string, language: string, segments: TranscriptSegment[]): string {
  return createHash("sha256").update(JSON.stringify({ source, language, segments })).digest("hex");
}

async function processTranscript(job: TranscriptJob, lease: Lease): Promise<void> {
  await loadYouTubeVideo(job.videoId, job.youtubeVideoId);
  const outcome = await transcriptDeps.fetchCaptions(job.youtubeVideoId, job.language);
  lease.assert();
  const detail: Record<string, unknown> = { available: outcome.available };

  let result: { source: TranscriptSource; language: string; segments: TranscriptSegment[] };
  if (outcome.kind === "ok") {
    detail.basis = outcome.basis;
    result = { source: outcome.source, language: outcome.language, segments: outcome.segments };
  } else if (outcome.kind === "ambiguous") {
    throw new TranscriptError(
      "language_ambiguous",
      "此影片有多種字幕語言，無法判定原文，請選擇原文語言",
      false,
      detail,
    );
  } else {
    const what = outcome.reason === "no_captions" ? "此影片沒有字幕" : `沒有「${outcome.language}」語言的字幕`;
    if (!transcriptDeps.asrConfigured()) {
      throw new TranscriptError(outcome.reason, `${what}，且伺服器未設定語音辨識（ASR）`, false, {
        ...detail,
        asr: "not_configured",
      });
    }
    try {
      const asr = await transcriptDeps.runAsr(job.youtubeVideoId, outcome.language ?? job.language);
      result = { source: "asr", language: asr.language, segments: toSegments(asr.cues) };
      detail.basis = "asr";
    } catch (err) {
      if (err instanceof TranscriptError) err.detail = { ...detail, ...err.detail, captions: outcome.reason };
      throw err;
    }
  }
  lease.assert();

  const hash = hashTranscript(result.source, result.language, result.segments);
  const published = await prisma.$transaction(async (tx) => {
    const live = await tx.transcriptJob.findFirst({
      where: { id: job.id, leaseToken: lease.token, status: "processing" },
      select: { thenTranslate: true },
    });
    if (!live) throw new LeaseLostError();
    const video = await tx.video.findUnique({ where: { id: job.videoId }, select: { source: true, youtubeId: true } });
    if (!video) throw new TranscriptError("video_deleted", "影片已刪除");
    if (video.source !== "youtube" || video.youtubeId !== job.youtubeVideoId) {
      throw new TranscriptError("video_changed", "影片來源已變更，此結果不會寫入");
    }
    const newer = await tx.videoTranscript.findFirst({
      where: { videoId: job.videoId, youtubeVideoId: job.youtubeVideoId, requestedAt: { gt: job.createdAt } },
      select: { id: true },
    });
    if (newer) throw new TranscriptError("superseded", "較新的請求已完成，此結果未發布");

    const current = await tx.videoTranscript.findFirst({
      where: { videoId: job.videoId, youtubeVideoId: job.youtubeVideoId },
      orderBy: { version: "desc" },
    });
    let row: VideoTranscript;
    if (current && current.contentHash === hash) {
      row = await tx.videoTranscript.update({ where: { id: current.id }, data: { requestedAt: job.createdAt } });
      detail.reused = true;
    } else {
      const max = await tx.videoTranscript.aggregate({ where: { videoId: job.videoId }, _max: { version: true } });
      row = await tx.videoTranscript.create({
        data: {
          videoId: job.videoId,
          youtubeVideoId: job.youtubeVideoId,
          version: (max._max.version ?? 0) + 1,
          source: result.source,
          language: result.language,
          contentHash: hash,
          segments: JSON.stringify(result.segments),
          requestedAt: job.createdAt,
        },
      });
    }
    await tx.transcriptJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        activeKey: null,
        leaseToken: null,
        leaseUntil: null,
        resultId: row.id,
        errorCode: null,
        errorMessage: null,
        detail: JSON.stringify(detail),
        finishedAt: new Date(),
      },
    });
    return { row, thenTranslate: live.thenTranslate };
  }, TX_OPTIONS);
  lease.stop();

  // "Get transcript and translate": chain only after the original is published.
  if (published.thenTranslate) {
    const tasks: (() => Promise<void>)[] = [];
    const video = { id: job.videoId, source: "youtube", youtubeId: job.youtubeVideoId };
    await enqueueTranslation(video, published.row, published.thenTranslate, false, job.requestedById, (t) => tasks.push(t));
    for (const t of tasks) await t();
  }
}

async function processTranslation(job: TranscriptJob, lease: Lease): Promise<void> {
  const target = job.targetLanguage ?? TRANSLATE_TARGET;
  const transcript = job.transcriptId
    ? await prisma.videoTranscript.findUnique({ where: { id: job.transcriptId } })
    : null;
  if (!transcript) throw new TranscriptError("transcript_gone", "原文已不存在");
  await loadYouTubeVideo(transcript.videoId, transcript.youtubeVideoId);
  if (!transcriptDeps.llmConfigured()) {
    throw new TranscriptError("llm_not_configured", "翻譯服務未設定，請聯繫管理者", false, {
      hint: "伺服器缺少 NVIDIA_API_KEY 或 ANTHROPIC_API_KEY",
    });
  }
  const segments = parseJson<TranscriptSegment[]>(transcript.segments, []);
  const valid = new Set(segments.map((s) => s.id));
  const done: Record<string, string> = {};
  for (const [id, text] of Object.entries(parseJson<Record<string, string>>(job.progress, {}))) {
    if (valid.has(id) && typeof text === "string" && text) done[id] = text;
  }
  // Snapshot `done` at write time (renew serialises writes), so progress is
  // monotonic even with three workers finishing batches concurrently.
  const save = () =>
    lease.renew(() => ({
      progress: JSON.stringify(done),
      progressDone: Object.keys(done).length,
      progressTotal: segments.length,
    }));
  await save();
  lease.assert();

  const index = new Map(segments.map((s, i) => [s.id, i]));
  const contextBefore = (firstId: string) => {
    const i = index.get(firstId) ?? 0;
    return segments.slice(Math.max(0, i - 3), i).map((s) => s.text);
  };
  const limits = transcriptDeps.translationBatchLimits();
  const batches = batchSegments(
    segments.filter((s) => !done[s.id]).map((s) => ({ id: s.id, text: s.text })),
    limits.maxItems,
    limits.maxChars,
  );
  let next = 0;
  let aborted = false;
  // Every validated (sub-)batch is saved immediately, so a failure elsewhere
  // never discards finished work and a retry only re-sends what's missing.
  const sink = async (map: Map<string, string>) => {
    for (const [id, text] of map) done[id] = text;
    await save();
    lease.assert();
  };
  const worker = async () => {
    while (!aborted && next < batches.length) {
      const batch = batches[next++];
      await translateWithSplit(batch, contextBefore(batch[0].id), transcript.language, target, lease, sink);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(JOB_TIMING.translateConcurrency, batches.length) }, worker));
  } catch (err) {
    aborted = true;
    // Keep finished batches so a retry resumes instead of starting over.
    await save().catch(() => {});
    throw err;
  }

  const full = assembleTranslation(segments, done);
  if (!full) throw new TranscriptError("translation_invalid", "翻譯缺少段落，將重試", true);
  await prisma.$transaction(async (tx) => {
    const live = await tx.transcriptJob.findFirst({
      where: { id: job.id, leaseToken: lease.token, status: "processing" },
      select: { id: true },
    });
    if (!live) throw new LeaseLostError();
    const t = await tx.videoTranscript.findUnique({
      where: { id: transcript.id },
      select: { youtubeVideoId: true, video: { select: { source: true, youtubeId: true } } },
    });
    if (!t) throw new TranscriptError("transcript_gone", "原文已不存在");
    if (t.video.source !== "youtube" || t.video.youtubeId !== t.youtubeVideoId) {
      throw new TranscriptError("video_changed", "影片來源已變更，此結果不會寫入");
    }
    const newer = await tx.videoTranscriptTranslation.findFirst({
      where: { transcriptId: transcript.id, targetLanguage: target, requestedAt: { gt: job.createdAt } },
      select: { id: true },
    });
    if (newer) throw new TranscriptError("superseded", "較新的翻譯已完成，此結果未發布");
    const data = { segments: JSON.stringify(full), model: transcriptDeps.translateModel(), requestedAt: job.createdAt };
    const row = await tx.videoTranscriptTranslation.upsert({
      where: { transcriptId_targetLanguage: { transcriptId: transcript.id, targetLanguage: target } },
      create: { transcriptId: transcript.id, targetLanguage: target, ...data },
      update: data,
    });
    await tx.transcriptJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        activeKey: null,
        leaseToken: null,
        leaseUntil: null,
        resultId: row.id,
        progress: null,
        progressDone: full.length,
        progressTotal: full.length,
        errorCode: null,
        errorMessage: null,
        finishedAt: new Date(),
      },
    });
  }, TX_OPTIONS);
}

/**
 * Translate a batch, retrying once and then bisecting when the reply doesn't
 * match the ids. Each validated part is handed to `sink`; a segment that still
 * can't be translated alone fails the job (retryable) — never a partial result.
 */
async function translateWithSplit(
  batch: TranslatedSegment[],
  contextBefore: string[],
  from: string,
  to: string,
  lease: Lease,
  sink: (map: Map<string, string>) => Promise<void>,
  depth = 0,
): Promise<void> {
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    lease.assert();
    let reply: TranslatedSegment[];
    try {
      reply = await transcriptDeps.translateBatch({ segments: batch, contextBefore, from, to });
    } catch (err) {
      if (err instanceof TranscriptError && (err.code === "translation_too_long" || err.code === "translation_invalid")) {
        reason = err.message;
        if (err.code === "translation_too_long") break;
        continue;
      }
      throw err;
    }
    const v = validateTranslationBatch(
      batch.map((b) => b.id),
      reply,
    );
    if (v.ok) return sink(v.map);
    reason = v.reason;
  }
  // Bisect all the way down to single segments: with 120-item batches a fixed
  // depth cap stopped at pairs, so one bad segment failed its neighbour too.
  if (batch.length > 1) {
    const mid = batch.length >> 1;
    const ctx = [...contextBefore, ...batch.slice(0, mid).map((b) => b.text)].slice(-3);
    let firstError: unknown = null;
    // Try both halves even if one fails, so the good half is kept.
    for (const [part, partCtx] of [
      [batch.slice(0, mid), contextBefore],
      [batch.slice(mid), ctx],
    ] as const) {
      try {
        await translateWithSplit(part, partCtx, from, to, lease, sink, depth + 1);
      } catch (err) {
        if (err instanceof LeaseLostError || !(err instanceof TranscriptError) || err.code !== "translation_invalid") throw err;
        firstError ??= err;
      }
    }
    if (firstError) throw firstError;
    return;
  }
  throw new TranscriptError("translation_invalid", `翻譯結果與原文段落不一致（${reason}）`, true);
}
