import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeSegmentIndex,
  chunkLines,
  isAlreadyTarget,
  parseTimedText,
  type Segment,
} from "../src/lib/transcript";
import { videoEmbed } from "../src/lib/sources";

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
    [654, 2020, "[音楽]"],
    [18160, 1500, "大学4年間、 え"],
    [20000, 900, "Tom & Jerry 's <b>"],
    [21000, 900, "We're no strangers"],
  ]);
});

test("parses legacy timedtext (seconds)", () => {
  const xml = `<transcript><text start="1.5" dur="2.25">hello</text><text start="4" dur="1"> </text></transcript>`;
  assert.deepEqual(parseTimedText(xml), [[1500, 2250, "hello"]]);
});

test("finds the segment playing at a given time", () => {
  const segs: Segment[] = [[1000, 0, "a"], [3000, 0, "b"], [7000, 0, "c"]];
  assert.equal(activeSegmentIndex(segs, 0), -1);
  assert.equal(activeSegmentIndex(segs, 1000), 0);
  assert.equal(activeSegmentIndex(segs, 6999), 1);
  assert.equal(activeSegmentIndex(segs, 99_000), 2);
  assert.equal(activeSegmentIndex([], 5), -1);
});

test("chunks lines under the size limit without splitting lines", () => {
  const chunks = chunkLines(["aaaa", "bbbb", "cccc"], 10);
  assert.deepEqual(chunks, [["aaaa", "bbbb"], ["cccc"]]);
  assert.deepEqual(chunks.flat(), ["aaaa", "bbbb", "cccc"]);
});

test("skips translation for Traditional Chinese originals only", () => {
  assert.equal(isAlreadyTarget("zh-TW"), true);
  assert.equal(isAlreadyTarget("zh-Hant"), true);
  assert.equal(isAlreadyTarget("zh-CN"), false);
  assert.equal(isAlreadyTarget("ja"), false);
});

test("YouTube embed opts into the IFrame API and start offset only when asked", () => {
  assert.equal(videoEmbed("youtube", "dQw4w9WgXcQ"), "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1");
  const u = new URL(videoEmbed("youtube", "dQw4w9WgXcQ", true, { jsapiOrigin: "https://x.test", start: 47.8 }));
  assert.equal(u.searchParams.get("enablejsapi"), "1");
  assert.equal(u.searchParams.get("origin"), "https://x.test");
  assert.equal(u.searchParams.get("start"), "47");
  assert.equal(u.searchParams.get("autoplay"), "1");
});
