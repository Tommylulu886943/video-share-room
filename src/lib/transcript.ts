// Timed transcripts for YouTube videos: caption fetching, source-language
// detection, segment shaping and translation-batch validation.
// No DB and no Node-only imports — the client imports the types/helpers too.
// Job orchestration and persistence live in transcript-jobs.ts.
//
// NOTE: captions come from YouTube's unofficial Innertube player API (as the
// Android app; the web client's caption URLs need a PO token). It may change or
// rate-limit, so network failures are reported as retryable, never as "no captions".

/** One original-language segment. Times are integer ms on the video's own timeline. */
export interface TranscriptSegment {
  id: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

/** One translated segment; `id` must match an original segment. */
export interface TranslatedSegment {
  id: string;
  text: string;
}

export type TranscriptSource = "youtube_manual" | "youtube_auto" | "asr";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

/** Default translation target. */
export const TRANSLATE_TARGET = "zh-TW";
export const TRANSLATE_TARGETS = [TRANSLATE_TARGET] as const;

/** A caption cue as parsed from timedtext (before ids are assigned). */
export interface Cue {
  start_ms: number;
  dur_ms: number;
  text: string;
}

/** Thrown for expected, user-reportable failures. `code` is stored on the job. */
export class TranscriptError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- parsing ---

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos" || k === "#39") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

function cleanText(raw: string): string {
  // YouTube double-encodes caption text (`&amp;#39;` for an apostrophe), so
  // decode twice. Output is rendered as React text, never as HTML.
  return decodeEntities(decodeEntities(raw.replace(/<[^>]*>/g, "")))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse YouTube timedtext XML — format 3 (`<p t= d=>`, ms) or the legacy
 * format (`<text start= dur=>`, seconds). Empty spacer lines are dropped.
 */
export function parseTimedText(xml: string): Cue[] {
  const out: Cue[] = [];
  const p3 = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = p3.exec(xml))) {
    const t = /\bt="(\d+)"/.exec(m[1]);
    const d = /\bd="(\d+)"/.exec(m[1]);
    const text = cleanText(m[2]);
    if (t && text) out.push({ start_ms: Number(t[1]), dur_ms: d ? Number(d[1]) : 0, text });
  }
  if (out.length) return out;
  const legacy = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  while ((m = legacy.exec(xml))) {
    const s = /\bstart="([\d.]+)"/.exec(m[1]);
    const d = /\bdur="([\d.]+)"/.exec(m[1]);
    const text = cleanText(m[2]);
    if (s && text) {
      out.push({
        start_ms: Math.round(Number(s[1]) * 1000),
        dur_ms: d ? Math.round(Number(d[1]) * 1000) : 0,
        text,
      });
    }
  }
  return out;
}

/**
 * Assign stable ids and end times. Times are kept exactly as the source gave
 * them (no offsets, no gap compression); a cue without a duration ends where
 * the next one starts. Text is never merged, rewritten or de-duplicated.
 */
export function toSegments(cues: Cue[]): TranscriptSegment[] {
  const sorted = cues
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => a.start_ms - b.start_ms || a.i - b.i);
  const width = Math.max(4, String(sorted.length).length);
  return sorted.map((c, i) => {
    const start = Math.max(0, Math.round(c.start_ms));
    const next = sorted[i + 1]?.start_ms;
    const end =
      c.dur_ms > 0 ? start + Math.round(c.dur_ms) : next !== undefined && next > start ? Math.round(next) : start;
    return { id: `seg-${String(i + 1).padStart(width, "0")}`, start_ms: start, end_ms: end, text: c.text };
  });
}

/** Index of the segment playing at `ms` (last one starting at or before it), or -1. */
export function activeSegmentIndex(segments: { start_ms: number }[], ms: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start_ms <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

// -------------------------------------------------------------- languages ---

const LANG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/i;

/** Normalise a user-supplied BCP-47-ish code, or null when it isn't one. */
export function normalizeLanguage(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().replace(/_/g, "-");
  return LANG_RE.test(s) ? s : null;
}

function chineseScript(code: string): "hant" | "hans" | null {
  const c = code.toLowerCase();
  if (/(^|-)(hant|tw|hk|mo)(-|$)/.test(c)) return "hant";
  if (/(^|-)(hans|cn|sg)(-|$)/.test(c)) return "hans";
  return null;
}

/** Same spoken language? `en` ≈ `en-US`; Chinese additionally needs a compatible script. */
export function sameLanguage(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  const bx = x.split("-")[0];
  if (bx !== y.split("-")[0]) return false;
  if (bx !== "zh") return true;
  const sx = chineseScript(x);
  const sy = chineseScript(y);
  return !sx || !sy || sx === sy;
}

/** True when the original is already in the translation target's script. */
export function isAlreadyTarget(lang: string, target: string = TRANSLATE_TARGET): boolean {
  if (target.toLowerCase().startsWith("zh")) {
    return lang.toLowerCase().split("-")[0] === "zh" && chineseScript(lang) === chineseScript(target);
  }
  return sameLanguage(lang, target);
}

// --------------------------------------------------------- track choosing ---

export interface CaptionTrack {
  languageCode: string;
  kind: "manual" | "asr";
  name: string;
  baseUrl: string;
}

export interface LanguageOption {
  code: string;
  label: string;
  kinds: ("manual" | "asr")[];
}

export function languageOptions(tracks: CaptionTrack[]): LanguageOption[] {
  const map = new Map<string, LanguageOption>();
  for (const t of tracks) {
    const opt = map.get(t.languageCode) ?? {
      code: t.languageCode,
      label: t.name.replace(/\s*\(auto-generated\)\s*$/i, "") || t.languageCode,
      kinds: [],
    };
    if (!opt.kinds.includes(t.kind)) opt.kinds.push(t.kind);
    map.set(t.languageCode, opt);
  }
  return [...map.values()];
}

export type LanguageBasis = "requested" | "original_audio" | "single_auto_track" | "single_manual_track";

export type TrackChoice =
  | { kind: "track"; track: CaptionTrack; language: string; source: TranscriptSource; basis: LanguageBasis }
  /** The source language is known but no caption track exists for it (incl. no tracks at all). */
  | { kind: "none"; reason: "no_captions" | "language_unavailable"; language: string | null }
  /** Several candidate languages and nothing trustworthy to pick the original by. */
  | { kind: "ambiguous" };

function pick(tracks: CaptionTrack[], lang: string, kind: CaptionTrack["kind"]): CaptionTrack | undefined {
  const same = tracks.filter((t) => t.kind === kind && sameLanguage(t.languageCode, lang));
  return same.find((t) => t.languageCode.toLowerCase() === lang.toLowerCase()) ?? same[0];
}

/**
 * Choose the original-language track. Language comes from the user, else from
 * the audio track YouTube marks as original (auto-dubbed audio produces its own
 * auto-captions, so "the default/English track" is not trustworthy), else from
 * an unambiguous single candidate. Within the language: creator captions first,
 * then auto-generated. Translated captions are never offered as tracks.
 */
export function selectCaptionTrack(
  tracks: CaptionTrack[],
  opts: { requested?: string | null; originalAudioLang?: string | null },
): TrackChoice {
  let language: string | null = null;
  let basis: LanguageBasis = "requested";
  if (opts.requested) {
    language = opts.requested;
  } else if (opts.originalAudioLang) {
    language = opts.originalAudioLang;
    basis = "original_audio";
  } else {
    const auto = [...new Set(tracks.filter((t) => t.kind === "asr").map((t) => t.languageCode))];
    const manual = [...new Set(tracks.filter((t) => t.kind === "manual").map((t) => t.languageCode))];
    if (auto.length === 1) {
      language = auto[0];
      basis = "single_auto_track";
    } else if (auto.length === 0 && manual.length === 1) {
      language = manual[0];
      basis = "single_manual_track";
    } else if (tracks.length) {
      return { kind: "ambiguous" };
    }
  }
  if (!tracks.length) return { kind: "none", reason: "no_captions", language };
  if (!language) return { kind: "ambiguous" };
  const manual = pick(tracks, language, "manual");
  if (manual) return { kind: "track", track: manual, language: manual.languageCode, source: "youtube_manual", basis };
  const auto = pick(tracks, language, "asr");
  if (auto) return { kind: "track", track: auto, language: auto.languageCode, source: "youtube_auto", basis };
  return { kind: "none", reason: "language_unavailable", language };
}

interface InnertubeFormat {
  url?: string;
  audioTrack?: { id?: string; displayName?: string; isAutoDubbed?: boolean };
}

/**
 * Language of the audio track YouTube labels as the original
 * (`xtags=acont=original:lang=xx`, or display name "… original"), or null when
 * the video has no multi-audio metadata or it's inconclusive.
 */
export function originalAudioLanguage(formats: InnertubeFormat[]): string | null {
  const langs = new Set<string>();
  for (const f of formats) {
    const track = f.audioTrack;
    if (!track || track.isAutoDubbed) continue;
    let tags: Record<string, string> = {};
    try {
      const raw = f.url ? new URL(f.url).searchParams.get("xtags") : null;
      if (raw) tags = Object.fromEntries(raw.split(":").map((kv) => kv.split("=") as [string, string]));
    } catch {
      // ignore malformed URLs
    }
    const idLang = track.id?.split(".")[0];
    if (tags.acont === "original" && (tags.lang || idLang)) langs.add(tags.lang || idLang!);
    else if (!tags.acont && /\boriginal\b/i.test(track.displayName ?? "") && idLang) langs.add(idLang);
  }
  return langs.size === 1 ? [...langs][0] : null;
}

// ------------------------------------------------------------ YouTube I/O ---

const ANDROID_VERSION = "20.10.38";
const ANDROID_UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 11) gzip`;
const TIMEOUT_MS = 15_000;

export type CaptionOutcome =
  | {
      kind: "ok";
      source: "youtube_manual" | "youtube_auto";
      language: string;
      basis: LanguageBasis;
      segments: TranscriptSegment[];
      available: LanguageOption[];
    }
  | { kind: "none"; reason: "no_captions" | "language_unavailable"; language: string | null; available: LanguageOption[] }
  | { kind: "ambiguous"; available: LanguageOption[] };

async function ytFetch(fetchImpl: typeof fetch, url: string | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    throw new TranscriptError("fetch_failed", `無法連線 YouTube（${(err as Error).message}）`, true);
  }
}

/**
 * YouTube's bot wall for cloud/datacenter IPs ("Sign in to confirm you're not a
 * bot") — unlike age/private/members-only limits it says nothing about the video.
 */
export function isBotCheck(status: string, reason: string | undefined): boolean {
  return status === "LOGIN_REQUIRED" && /\bbot\b/i.test(reason ?? "");
}

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: {
        baseUrl: string;
        languageCode: string;
        kind?: string;
        name?: { simpleText?: string; runs?: { text: string }[] };
      }[];
    };
  };
  streamingData?: { adaptiveFormats?: InnertubeFormat[] };
};

const PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const TV_UA = "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version";
/** Fallback when the /tv page can't be read; YouTube rejects very old versions. */
const TV_VERSION_FALLBACK = "7.20261102.18.00";
let tvVersionCache: string | null = null;

async function readPlayer(res: Response): Promise<PlayerResponse> {
  if (res.status === 429 || res.status >= 500) {
    throw new TranscriptError("fetch_failed", `YouTube 暫時無法回應（HTTP ${res.status}）`, true);
  }
  if (!res.ok) throw new TranscriptError("fetch_failed", `YouTube 回應錯誤（HTTP ${res.status}）`);
  return (await res.json()) as PlayerResponse;
}

async function androidPlayer(fetchImpl: typeof fetch, videoId: string): Promise<PlayerResponse> {
  const res = await ytFetch(fetchImpl, PLAYER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
    body: JSON.stringify({
      context: {
        client: { clientName: "ANDROID", clientVersion: ANDROID_VERSION, androidSdkVersion: 30, hl: "en" },
      },
      videoId,
    }),
  });
  return readPlayer(res);
}

async function tvClientVersion(fetchImpl: typeof fetch): Promise<string> {
  if (tvVersionCache) return tvVersionCache;
  try {
    const res = await ytFetch(fetchImpl, "https://www.youtube.com/tv", { headers: { "User-Agent": TV_UA } });
    const v = (await res.text()).match(/"INNERTUBE_CLIENT_VERSION":"([\d.]+)"/)?.[1];
    if (v) tvVersionCache = v;
  } catch {
    // fall through to the bundled version
  }
  return tvVersionCache ?? TV_VERSION_FALLBACK;
}

/** Signed-in TV client: the one Innertube client that honours web cookies without a PO token. */
async function tvPlayer(fetchImpl: typeof fetch, videoId: string, auth: Record<string, string>): Promise<PlayerResponse> {
  const version = await tvClientVersion(fetchImpl);
  const res = await ytFetch(fetchImpl, PLAYER_URL, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      "User-Agent": TV_UA,
      Origin: "https://www.youtube.com",
      "X-Origin": "https://www.youtube.com",
      "X-YouTube-Client-Name": "7",
      "X-YouTube-Client-Version": version,
    },
    body: JSON.stringify({
      context: { client: { clientName: "TVHTML5", clientVersion: version, hl: "en" } },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  return readPlayer(res);
}

export interface CaptionFetchOptions {
  /** Route through a proxy (see youtube-fetch.ts). */
  fetchImpl?: typeof fetch;
  /**
   * Signed-in session headers (Cookie + SAPISIDHASH). When set, the cloud-IP bot
   * wall is retried as a signed-in TV client.
   */
  auth?: () => Promise<Record<string, string>>;
  /** Go straight to the signed-in client (diagnostics). */
  preferAuth?: boolean;
}

const playerStatus = (p: PlayerResponse) => p.playabilityStatus?.status ?? "UNKNOWN";

/** Fetch the original-language captions for a YouTube video. */
export async function fetchYouTubeCaptions(
  videoId: string,
  requested: string | null,
  opts: CaptionFetchOptions = {},
): Promise<CaptionOutcome> {
  const { fetchImpl = fetch, auth, preferAuth = false } = opts;
  let signedIn: Record<string, string> | null = null;
  let player: PlayerResponse;
  if (auth && preferAuth) {
    signedIn = await auth();
    player = await tvPlayer(fetchImpl, videoId, signedIn);
  } else {
    player = await androidPlayer(fetchImpl, videoId);
    if (auth && isBotCheck(playerStatus(player), player.playabilityStatus?.reason)) {
      signedIn = await auth();
      player = await tvPlayer(fetchImpl, videoId, signedIn);
    }
  }

  const status = playerStatus(player);
  const rawTracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  // A blocked/unplayable response also lacks captions — never report that as "no captions".
  if (status !== "OK" && !rawTracks.length) {
    const reason = player.playabilityStatus?.reason;
    const detail = { playability: status, reason: reason ?? null, signedIn: !!signedIn };
    if (signedIn && status === "LOGIN_REQUIRED") {
      throw new TranscriptError(
        "youtube_auth_failed",
        "YouTube 不接受伺服器設定的登入資訊，請管理者重新設定後再試。",
        false,
        { ...detail, hint: "YOUTUBE_COOKIES 可能已過期或被登出，請重新匯出後更新" },
      );
    }
    if (isBotCheck(status, reason)) {
      throw new TranscriptError(
        "youtube_blocked",
        "YouTube 拒絕了伺服器的連線（要求驗證不是機器人）。這是 YouTube 封鎖雲端主機 IP 造成的，與影片本身無關，需由管理者調整伺服器設定。",
        false,
        { ...detail, hint: "設定 YouTube 登入 cookie（YOUTUBE_COOKIES）或代理（YOUTUBE_PROXY_URL）" },
      );
    }
    throw new TranscriptError(
      "source_restricted",
      `YouTube 限制存取（${status}${reason ? `：${reason}` : ""}）`,
      false,
      detail,
    );
  }
  const tracks: CaptionTrack[] = rawTracks.map((t) => ({
    languageCode: t.languageCode,
    kind: t.kind === "asr" ? "asr" : "manual",
    name: t.name?.simpleText ?? t.name?.runs?.map((r) => r.text).join("") ?? t.languageCode,
    baseUrl: t.baseUrl,
  }));
  const available = languageOptions(tracks);
  const choice = selectCaptionTrack(tracks, {
    requested,
    originalAudioLang: originalAudioLanguage(player.streamingData?.adaptiveFormats ?? []),
  });
  if (choice.kind === "ambiguous") return { kind: "ambiguous", available };
  if (choice.kind === "none") return { ...choice, available };

  const url = new URL(choice.track.baseUrl);
  if (url.hostname !== "www.youtube.com") throw new TranscriptError("fetch_failed", "字幕來源網址異常");
  url.searchParams.delete("fmt");
  url.searchParams.delete("tlang"); // never accept a machine-translated rendition as the original
  const xmlRes = await ytFetch(fetchImpl, url, {
    headers: signedIn ? { Cookie: signedIn.Cookie ?? "", "User-Agent": TV_UA } : { "User-Agent": ANDROID_UA },
  });
  if (!xmlRes.ok) {
    throw new TranscriptError("fetch_failed", `無法下載字幕（HTTP ${xmlRes.status}）`, xmlRes.status === 429 || xmlRes.status >= 500);
  }
  const segments = toSegments(parseTimedText(await xmlRes.text()));
  if (!segments.length) {
    // Signed URLs that need a PO token come back empty rather than as an error.
    throw new TranscriptError("fetch_failed", "字幕檔是空的，請稍後重試", !signedIn, { signedIn: !!signedIn });
  }
  return {
    kind: "ok",
    source: choice.source as "youtube_manual" | "youtube_auto",
    language: choice.language,
    basis: choice.basis,
    segments,
    available,
  };
}

// ------------------------------------------------------------ translation ---

/** Split segments into model-sized batches (by count and characters), never splitting a segment. */
export function batchSegments<T extends { text: string }>(items: T[], maxItems = 120, maxChars = 6000): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let len = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= maxItems || len + it.text.length > maxChars)) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(it);
    len += it.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Check a model reply covers exactly the requested ids — no missing, duplicate
 * or invented ids, and no empty text. Returns id → text on success.
 */
export function validateTranslationBatch(
  ids: string[],
  reply: TranslatedSegment[],
): { ok: true; map: Map<string, string> } | { ok: false; reason: string } {
  const want = new Set(ids);
  const map = new Map<string, string>();
  for (const r of reply) {
    if (!want.has(r.id)) return { ok: false, reason: `unexpected id ${r.id}` };
    if (map.has(r.id)) return { ok: false, reason: `duplicate id ${r.id}` };
    const text = r.text.replace(/\s+/g, " ").trim();
    if (!text) return { ok: false, reason: `empty text for ${r.id}` };
    map.set(r.id, text);
  }
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) return { ok: false, reason: `missing ${missing.length} id(s), e.g. ${missing[0]}` };
  return { ok: true, map };
}

const CJK = "\\u3000-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef";
const HALF_TO_FULL: Record<string, string> = { ",": "，", "?": "？", "!": "！", ":": "：", ";": "；" };
const HALF_PUNCT_NEAR_CJK = new RegExp(`(?<=[${CJK}])\\s*([,?!:;])\\s*|\\s*([,?!:;])\\s*(?=[${CJK}])`, "g");

/**
 * Chinese text uses full-width punctuation; models often emit ASCII `,?!:;`.
 * Only marks touching a CJK character change — `2:00`, `1,000`, `Hi!` stay as-is.
 */
export function normalizeChinesePunctuation(text: string): string {
  return text.replace(HALF_PUNCT_NEAR_CJK, (_m, a?: string, b?: string) => HALF_TO_FULL[(a ?? b)!]);
}

/** Assemble a complete translation in original order, or null if any segment lacks one. */
export function assembleTranslation(
  segments: TranscriptSegment[],
  done: Record<string, string>,
): TranslatedSegment[] | null {
  const out: TranslatedSegment[] = [];
  for (const s of segments) {
    const text = done[s.id];
    if (typeof text !== "string" || !text) return null;
    out.push({ id: s.id, text });
  }
  return out;
}

/** `m:ss` / `h:mm:ss` label for a position in ms. */
export function formatTimestamp(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Link to the original video at a position (used when no controllable player is available). */
export function youtubeTimeUrl(videoId: string, ms: number): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.floor(ms / 1000)}s`;
}
