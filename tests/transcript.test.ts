import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeSegmentIndex,
  assembleTranslation,
  batchSegments,
  isAlreadyTarget,
  normalizeChinesePunctuation,
  normalizeLanguage,
  originalAudioLanguage,
  parseTimedText,
  sameLanguage,
  selectCaptionTrack,
  toSegments,
  validateTranslationBatch,
  youtubeTimeUrl,
  type CaptionTrack,
} from "../src/lib/transcript";
import { parseWorkerOutput, workerReplyToCues } from "../src/lib/transcript-asr";
import { parseVideoRef, videoEmbed } from "../src/lib/sources";

test("parses YouTube format-3 timedtext, dropping spacer lines and decoding entities", () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3"><body>
<p t="654" d="2020" w="1">[音楽]</p>
<p t="18150" w="1" a="1">
</p>
<p t="18160" d="1500"><s>大学4年間、</s><s t="300"> え</s></p>
<p t="20000" d="900">Tom &amp; Jerry &#39;s &lt;b&gt;</p>
<p t="21000" d="900">We&amp;#39;re no strangers</p>
</body></timedtext>`;
  assert.deepEqual(parseTimedText(xml), [
    { start_ms: 654, dur_ms: 2020, text: "[音楽]" },
    { start_ms: 18160, dur_ms: 1500, text: "大学4年間、 え" },
    { start_ms: 20000, dur_ms: 900, text: "Tom & Jerry 's <b>" },
    { start_ms: 21000, dur_ms: 900, text: "We're no strangers" },
  ]);
});

test("parses legacy timedtext (seconds)", () => {
  const xml = `<transcript><text start="1.5" dur="2.25">hello</text><text start="4" dur="1"> </text></transcript>`;
  assert.deepEqual(parseTimedText(xml), [{ start_ms: 1500, dur_ms: 2250, text: "hello" }]);
});

test("segments keep the source timeline exactly: no offset, no gap compression, no merging", () => {
  const segs = toSegments([
    { start_ms: 121_200, dur_ms: 3600, text: "同じ" },
    { start_ms: 5_000, dur_ms: 0, text: "a" },
    { start_ms: 900_000, dur_ms: 1000, text: "同じ" }, // duplicate text is kept
    { start_ms: 10_000, dur_ms: 0, text: "b" },
  ]);
  assert.deepEqual(segs, [
    { id: "seg-0001", start_ms: 5_000, end_ms: 10_000, text: "a" }, // no duration → until next start
    { id: "seg-0002", start_ms: 10_000, end_ms: 121_200, text: "b" },
    { id: "seg-0003", start_ms: 121_200, end_ms: 124_800, text: "同じ" },
    { id: "seg-0004", start_ms: 900_000, end_ms: 901_000, text: "同じ" },
  ]);
  for (const s of segs) assert.ok(Number.isInteger(s.start_ms) && Number.isInteger(s.end_ms));
});

test("a t=121s link is only a playback start: the stored id has no offset and times are untouched", () => {
  assert.deepEqual(parseVideoRef("https://www.youtube.com/watch?v=S9qKB6pLLlY&t=121s"), {
    source: "youtube",
    id: "S9qKB6pLLlY",
  });
  const segs = toSegments([{ start_ms: 121_200, dur_ms: 3600, text: "x" }]);
  assert.equal(segs[0].start_ms, 121_200);
  assert.equal(activeSegmentIndex(segs, 121_000), -1);
  assert.equal(activeSegmentIndex(segs, 121_200), 0);
  assert.equal(youtubeTimeUrl("S9qKB6pLLlY", 121_200), "https://www.youtube.com/watch?v=S9qKB6pLLlY&t=121s");
});

test("finds the segment playing at a given time", () => {
  const segs = [{ start_ms: 1000 }, { start_ms: 3000 }, { start_ms: 7000 }];
  assert.equal(activeSegmentIndex(segs, 0), -1);
  assert.equal(activeSegmentIndex(segs, 1000), 0);
  assert.equal(activeSegmentIndex(segs, 6999), 1);
  assert.equal(activeSegmentIndex(segs, 99_000), 2);
  assert.equal(activeSegmentIndex([], 5), -1);
});

const track = (languageCode: string, kind: "manual" | "asr"): CaptionTrack => ({
  languageCode,
  kind,
  name: languageCode,
  baseUrl: `https://www.youtube.com/api/timedtext?lang=${languageCode}`,
});

test("auto-dubbed audio: the original-audio language wins over the default English track", () => {
  // Shape seen on the real test video: en-US auto-captions come from the AI dub.
  const tracks = [track("en-US", "asr"), track("ja", "asr")];
  const formats = [
    {
      url: "https://rr.googlevideo.com/videoplayback?xtags=acont%3Ddubbed-auto%3Alang%3Den-US",
      audioTrack: { id: "en-US.10", displayName: "English (US)", isAutoDubbed: true },
    },
    {
      url: "https://rr.googlevideo.com/videoplayback?xtags=acont%3Doriginal%3Adrc%3D1%3Alang%3Dja",
      audioTrack: { id: "ja.4", displayName: "Japanese original" },
    },
  ];
  const original = originalAudioLanguage(formats);
  assert.equal(original, "ja");
  const choice = selectCaptionTrack(tracks, { originalAudioLang: original });
  assert.equal(choice.kind, "track");
  assert.ok(choice.kind === "track");
  assert.equal(choice.language, "ja");
  assert.equal(choice.source, "youtube_auto");
  assert.equal(choice.basis, "original_audio");
  // Without that signal two auto languages are ambiguous — never guess English.
  assert.deepEqual(selectCaptionTrack(tracks, {}), { kind: "ambiguous" });
});

test("within the source language, creator captions beat auto captions", () => {
  const tracks = [track("ja", "asr"), track("en", "manual"), track("ja", "manual")];
  const c = selectCaptionTrack(tracks, {});
  assert.ok(c.kind === "track");
  assert.equal(c.track.languageCode, "ja");
  assert.equal(c.source, "youtube_manual");
  assert.equal(c.basis, "single_auto_track");
});

test("requested language: exact/base match, else reported as unavailable (not swapped for another)", () => {
  const tracks = [track("en-US", "asr"), track("ja", "asr")];
  const en = selectCaptionTrack(tracks, { requested: "en" });
  assert.ok(en.kind === "track" && en.track.languageCode === "en-US");
  assert.deepEqual(selectCaptionTrack(tracks, { requested: "ko" }), {
    kind: "none",
    reason: "language_unavailable",
    language: "ko",
  });
  assert.deepEqual(selectCaptionTrack([], { originalAudioLang: "ja" }), {
    kind: "none",
    reason: "no_captions",
    language: "ja",
  });
  assert.deepEqual(selectCaptionTrack([], {}), { kind: "none", reason: "no_captions", language: null });
  // Several creator languages and no auto track → ask the user.
  assert.deepEqual(selectCaptionTrack([track("en", "manual"), track("ja", "manual")], {}), { kind: "ambiguous" });
});

test("language helpers", () => {
  assert.equal(sameLanguage("en", "en-US"), true);
  assert.equal(sameLanguage("zh-TW", "zh-Hant"), true);
  assert.equal(sameLanguage("zh-TW", "zh-CN"), false);
  assert.equal(sameLanguage("ja", "en"), false);
  assert.equal(isAlreadyTarget("zh-TW"), true);
  assert.equal(isAlreadyTarget("zh-Hant"), true);
  assert.equal(isAlreadyTarget("zh-CN"), false);
  assert.equal(isAlreadyTarget("zh"), false);
  assert.equal(isAlreadyTarget("ja"), false);
  assert.equal(normalizeLanguage(" ja "), "ja");
  assert.equal(normalizeLanguage("zh_TW"), "zh-TW");
  assert.equal(normalizeLanguage("ja; drop"), null);
  assert.equal(normalizeLanguage(42), null);
});

test("translation replies must cover exactly the requested ids", () => {
  const ids = ["seg-1", "seg-2"];
  const ok = validateTranslationBatch(ids, [
    { id: "seg-1", text: " 一 " },
    { id: "seg-2", text: "二" },
  ]);
  assert.ok(ok.ok);
  assert.equal(ok.map.get("seg-1"), "一");
  assert.equal(validateTranslationBatch(ids, [{ id: "seg-1", text: "一" }]).ok, false); // missing
  assert.equal(
    validateTranslationBatch(ids, [
      { id: "seg-1", text: "一" },
      { id: "seg-1", text: "一" },
      { id: "seg-2", text: "二" },
    ]).ok,
    false,
  ); // duplicate
  assert.equal(
    validateTranslationBatch(ids, [
      { id: "seg-1", text: "一" },
      { id: "seg-2", text: "二" },
      { id: "seg-3", text: "三" },
    ]).ok,
    false,
  ); // invented
  assert.equal(
    validateTranslationBatch(ids, [
      { id: "seg-1", text: "一" },
      { id: "seg-2", text: "  " },
    ]).ok,
    false,
  ); // empty
});

test("batches respect item and character limits without splitting segments", () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, text: "x".repeat(10) }));
  const byCount = batchSegments(items, 3, 1000);
  assert.deepEqual(byCount.map((b) => b.length), [3, 3, 1]);
  const byChars = batchSegments(items, 100, 25);
  assert.deepEqual(byChars.map((b) => b.length), [2, 2, 2, 1]);
  assert.deepEqual(byChars.flat(), items);
});

test("a translation is only complete when every original segment has text", () => {
  const segs = toSegments([
    { start_ms: 0, dur_ms: 1, text: "a" },
    { start_ms: 5, dur_ms: 1, text: "b" },
  ]);
  assert.equal(assembleTranslation(segs, { "seg-0001": "甲" }), null);
  assert.deepEqual(assembleTranslation(segs, { "seg-0002": "乙", "seg-0001": "甲" }), [
    { id: "seg-0001", text: "甲" },
    { id: "seg-0002", text: "乙" },
  ]);
});

test("ASR worker output is parsed and failures stay distinct", () => {
  const ok = workerReplyToCues(
    parseWorkerOutput(
      'progress...\n{"ok":true,"language":"ja","segments":[{"start_ms":1200.4,"end_ms":3000,"text":" こんにちは "},{"start_ms":-1,"end_ms":2,"text":"bad"}]}\n',
    ),
  );
  assert.deepEqual(ok, { language: "ja", cues: [{ start_ms: 1200, dur_ms: 1800, text: "こんにちは" }] });
  assert.throws(
    () => workerReplyToCues(parseWorkerOutput('{"ok":false,"error":"audio_unavailable","message":"HTTP 403"}')),
    (e: { code?: string }) => e.code === "audio_unavailable",
  );
  assert.throws(
    () => workerReplyToCues(parseWorkerOutput('{"ok":false,"error":"source_restricted"}')),
    (e: { code?: string }) => e.code === "source_restricted",
  );
  assert.throws(() => workerReplyToCues(parseWorkerOutput("garbage")), (e: { code?: string }) => e.code === "asr_failed");
  assert.throws(
    () => workerReplyToCues(parseWorkerOutput('{"ok":true,"language":"ja","segments":[]}')),
    (e: { code?: string }) => e.code === "asr_failed",
  );
});

test("YouTube embed opts into the IFrame API and start offset only when asked", () => {
  assert.equal(videoEmbed("youtube", "dQw4w9WgXcQ"), "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1");
  const u = new URL(videoEmbed("youtube", "dQw4w9WgXcQ", true, { jsapiOrigin: "https://x.test", start: 47.8 }));
  assert.equal(u.searchParams.get("enablejsapi"), "1");
  assert.equal(u.searchParams.get("origin"), "https://x.test");
  assert.equal(u.searchParams.get("start"), "47");
  assert.equal(u.searchParams.get("autoplay"), "1");
});

test("Chinese punctuation is made full-width only next to CJK text", () => {
  assert.equal(normalizeChinesePunctuation("算是有的,我蠻常攻擊下方的"), "算是有的，我蠻常攻擊下方的");
  assert.equal(normalizeChinesePunctuation("是有事先準備的嗎?用得蠻多的!"), "是有事先準備的嗎？用得蠻多的！");
  assert.equal(normalizeChinesePunctuation("重點: 下段"), "重點：下段");
  assert.equal(normalizeChinesePunctuation("在 2:00 時打了 1,000 次 OK!"), "在 2:00 時打了 1,000 次 OK!");
  assert.equal(normalizeChinesePunctuation("[音樂]"), "[音樂]");
});
