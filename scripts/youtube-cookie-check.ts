// Real check of the signed-in (YOUTUBE_COOKIES) caption path against YouTube:
//   npx tsx scripts/youtube-cookie-check.ts [YouTube URL or id]
// Forces the signed-in TV client (skips the Android client that works on home
// connections), so it shows whether production would succeed with these cookies.
// Never prints cookie values.
import "dotenv/config";
import { fetchYouTubeCaptions, formatTimestamp, TranscriptError } from "../src/lib/transcript";
import { parseYouTubeCookies, youtubeAuth, youtubeFetch } from "../src/lib/youtube-fetch";

async function main() {
  const arg = process.argv[2] ?? "https://www.youtube.com/watch?v=S9qKB6pLLlY&t=121s";
  const id = arg.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? arg;
  const t = Number(arg.match(/[?&]t=(\d+)/)?.[1] ?? 0) * 1000;

  const jar = parseYouTubeCookies(process.env.YOUTUBE_COOKIES);
  console.log(`cookies: ${jar.size} parsed, SAPISID ${jar.has("SAPISID") || jar.has("__Secure-3PAPISID") ? "present" : "MISSING"}`);
  const auth = youtubeAuth();
  if (!auth) {
    console.log("YOUTUBE_COOKIES is not set or has no SAPISID (not a signed-in session).");
    process.exit(1);
  }
  try {
    const out = await fetchYouTubeCaptions(id, null, { fetchImpl: youtubeFetch(), auth, preferAuth: true });
    if (out.kind !== "ok") {
      console.log("signed-in client reached YouTube, but:", out.kind, "reason" in out ? out.reason : "", out.available);
      return;
    }
    console.log(`OK via signed-in TV client: ${out.source} · ${out.language} (${out.basis}) · ${out.segments.length} segments`);
    const near = out.segments.filter((s) => s.end_ms >= t - 3000).slice(0, 4);
    for (const s of near) console.log(`  ${formatTimestamp(s.start_ms)} [${s.start_ms}–${s.end_ms}] ${s.text}`);
  } catch (e) {
    if (e instanceof TranscriptError) {
      console.log(`FAILED: ${e.code} — ${e.message}`);
      if (e.detail) console.log("detail:", JSON.stringify(e.detail));
      process.exit(1);
    }
    throw e;
  }
}

main();
