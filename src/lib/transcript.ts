// Caption transcripts for YouTube videos + machine translation.
// Pure module (no DB) so parsing can be unit-tested; caching lives in
// transcript-store.ts.
//
// NOTE: both endpoints used here are unofficial:
//  - YouTube's Innertube player API (as the Android app) — the web client's
//    caption URLs now require a PO token and come back empty.
//  - Google Translate's public "gtx" endpoint.
// Either may change or rate-limit; callers must treat failures as transient.

/** [startMs, durationMs, text] — compact for storage and the wire. */
export type Segment = [number, number, string];

export type TranscriptResult =
  | { status: "ok"; sourceLang: string; kind: "asr" | "manual"; segments: Segment[] }
  | { status: "none" };

/** Translation target offered in the UI. */
export const TRANSLATE_TARGET = "zh-TW";

const ANDROID_VERSION = "20.10.38";
const ANDROID_UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 11) gzip`;
const TIMEOUT_MS = 10_000;

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
export function parseTimedText(xml: string): Segment[] {
  const out: Segment[] = [];
  const p3 = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = p3.exec(xml))) {
    const t = /\bt="(\d+)"/.exec(m[1]);
    const d = /\bd="(\d+)"/.exec(m[1]);
    const text = cleanText(m[2]);
    if (t && text) out.push([Number(t[1]), d ? Number(d[1]) : 0, text]);
  }
  if (out.length) return out;
  const legacy = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  while ((m = legacy.exec(xml))) {
    const s = /\bstart="([\d.]+)"/.exec(m[1]);
    const d = /\bdur="([\d.]+)"/.exec(m[1]);
    const text = cleanText(m[2]);
    if (s && text) out.push([Math.round(Number(s[1]) * 1000), d ? Math.round(Number(d[1]) * 1000) : 0, text]);
  }
  return out;
}

/** Index of the segment playing at `ms` (last one starting at or before it), or -1. */
export function activeSegmentIndex(segments: Segment[], ms: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid][0] <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

/** Fetch the best caption track: a creator-provided one first, else auto-generated. */
export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptResult> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: ANDROID_VERSION, androidSdkVersion: 30 } },
      videoId,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`youtube player ${res.status}`);
  const player = (await res.json()) as {
    playabilityStatus?: { status?: string };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  };
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    // A blocked/unplayable response also lacks captions — don't cache that as "none".
    if (player.playabilityStatus?.status !== "OK") {
      throw new Error(`youtube playability ${player.playabilityStatus?.status ?? "unknown"}`);
    }
    return { status: "none" };
  }
  const track = tracks.find((t) => t.kind !== "asr") ?? tracks[0];
  const url = new URL(track.baseUrl);
  if (url.hostname !== "www.youtube.com") throw new Error("unexpected caption host");
  url.searchParams.delete("fmt");
  const xmlRes = await fetch(url, {
    headers: { "User-Agent": ANDROID_UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!xmlRes.ok) throw new Error(`youtube timedtext ${xmlRes.status}`);
  const segments = parseTimedText(await xmlRes.text());
  if (!segments.length) throw new Error("empty caption track");
  return {
    status: "ok",
    sourceLang: track.languageCode,
    kind: track.kind === "asr" ? "asr" : "manual",
    segments,
  };
}

/** True when the original is already in the translation target's script. */
export function isAlreadyTarget(lang: string): boolean {
  return /^zh-(tw|hant|hk|mo)\b/i.test(lang);
}

async function gtx(text: string, from: string, to: string): Promise<string> {
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ q: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = (await res.json()) as [Array<[string | null]> | null];
  return (data[0] ?? []).map((part) => part[0] ?? "").join("");
}

/** Group lines into newline-joined chunks below `max` chars. */
export function chunkLines(lines: string[], max = 3500): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (cur.length && len + line.length + 1 > max) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += line.length + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * Translate segment texts line-for-line (timings preserved). Lines are sent in
 * newline-joined batches; if a batch comes back with a different line count we
 * fall back to translating that batch one line at a time.
 */
export async function translateSegments(
  segments: Segment[],
  from: string,
  to: string = TRANSLATE_TARGET,
): Promise<Segment[]> {
  const lines = segments.map((s) => s[2].replace(/\n/g, " "));
  const out: string[] = [];
  for (const chunk of chunkLines(lines)) {
    const translated = (await gtx(chunk.join("\n"), from, to)).split("\n");
    if (translated.length === chunk.length) {
      out.push(...translated.map((t) => t.trim()));
      continue;
    }
    for (let i = 0; i < chunk.length; i += 5) {
      const part = await Promise.all(chunk.slice(i, i + 5).map((l) => gtx(l, from, to)));
      out.push(...part.map((t) => t.replace(/\s*\n\s*/g, " ").trim()));
    }
  }
  return segments.map((s, i) => [s[0], s[1], out[i] || s[2]]);
}
