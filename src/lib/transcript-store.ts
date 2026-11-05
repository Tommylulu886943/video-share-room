import { prisma } from "@/lib/db";
import {
  fetchYouTubeTranscript,
  isAlreadyTarget,
  translateSegments,
  type Segment,
} from "@/lib/transcript";

export type TranscriptLang = "orig" | "zh-TW";

export interface TranscriptPayload {
  status: "ok" | "none";
  lang: TranscriptLang;
  sourceLang: string | null;
  kind: string | null;
  segments: Segment[];
}

/** Re-check videos that had no captions after this long (creators add them later). */
const NONE_TTL_MS = 24 * 60 * 60 * 1000;

function toPayload(row: {
  status: string;
  lang: string;
  sourceLang: string | null;
  kind: string | null;
  segments: string;
}): TranscriptPayload {
  return {
    status: row.status === "ok" ? "ok" : "none",
    lang: row.lang as TranscriptLang,
    sourceLang: row.sourceLang,
    kind: row.kind,
    segments: row.status === "ok" ? (JSON.parse(row.segments) as Segment[]) : [],
  };
}

async function save(externalId: string, lang: TranscriptLang, p: Omit<TranscriptPayload, "lang">) {
  const data = {
    sourceLang: p.sourceLang,
    kind: p.kind,
    status: p.status,
    segments: JSON.stringify(p.segments),
    fetchedAt: new Date(),
  };
  await prisma.transcript.upsert({
    where: { source_externalId_lang: { source: "youtube", externalId, lang } },
    create: { source: "youtube", externalId, lang, ...data },
    update: data,
  });
}

/**
 * Cached transcript for a YouTube video. Successful fetches are kept forever;
 * "no captions" is re-checked daily. Network failures throw (never cached).
 */
export async function getYouTubeTranscript(
  externalId: string,
  lang: TranscriptLang,
): Promise<TranscriptPayload> {
  const cached = await prisma.transcript.findUnique({
    where: { source_externalId_lang: { source: "youtube", externalId, lang } },
  });
  if (
    cached &&
    (cached.status === "ok" || Date.now() - cached.fetchedAt.getTime() < NONE_TTL_MS)
  ) {
    return toPayload(cached);
  }

  if (lang === "orig") {
    const r = await fetchYouTubeTranscript(externalId);
    const p =
      r.status === "ok"
        ? { status: "ok" as const, sourceLang: r.sourceLang, kind: r.kind, segments: r.segments }
        : { status: "none" as const, sourceLang: null, kind: null, segments: [] };
    await save(externalId, "orig", p);
    return { ...p, lang };
  }

  const orig = await getYouTubeTranscript(externalId, "orig");
  if (orig.status !== "ok" || !orig.sourceLang || isAlreadyTarget(orig.sourceLang)) {
    return { ...orig, lang };
  }
  const segments = await translateSegments(orig.segments, orig.sourceLang, lang);
  const p = { status: "ok" as const, sourceLang: orig.sourceLang, kind: orig.kind, segments };
  await save(externalId, lang, p);
  return { ...p, lang };
}
