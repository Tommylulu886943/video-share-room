import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVideoRef, parseWebUrl, videoEmbed, videoWatchUrl } from "../src/lib/sources";
import { importUrl } from "../extensions/courtside/urls.mjs";

test("existing platforms remain playable", () => {
  assert.deepEqual(parseVideoRef("https://youtu.be/dQw4w9WgXcQ"), { source: "youtube", id: "dQw4w9WgXcQ" });
  // A timestamped share link is a playback start, not part of the stored id.
  assert.deepEqual(parseVideoRef("https://www.youtube.com/watch?v=S9qKB6pLLlY&t=121s"), { source: "youtube", id: "S9qKB6pLLlY" });
  assert.equal(parseVideoRef("https://www.bilibili.com/video/BV1234567890")?.source, "bilibili");
  assert.equal(parseVideoRef("https://www.instagram.com/reel/abc123/")?.source, "instagram");
});

test("arbitrary websites survive round trip without being embedded", () => {
  const href = "https://example.com/watch?a=1&b=2#clip";
  assert.deepEqual(parseVideoRef(href), { source: "link", id: href });
  assert.equal(videoWatchUrl("link", href), href);
  assert.equal(videoEmbed("link", href), "");
  assert.equal(parseVideoRef("https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ")?.source, "link");
});

test("reject executable, temporary, credential-bearing and oversized URLs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/video.mp4", "blob:https://example.com/123", "https://user:pass@example.com/", "ftp://youtube.com/watch?v=dQw4w9WgXcQ", "https://example.com/" + "a".repeat(8192)]) {
    assert.equal(parseVideoRef(url), null, url.slice(0, 80));
    assert.equal(parseWebUrl(url), null);
  }
});

test("extension always targets production and encodes source/title safely", () => {
  const source = "https://example.com/watch?a=1&b=2#clip";
  const url = new URL(importUrl(source, "測試 & # 影片"));
  assert.equal(url.origin, "https://video-share-room.vercel.app");
  assert.equal(url.pathname, "/import");
  assert.equal(url.searchParams.get("url"), source);
  assert.equal(url.searchParams.get("title"), "測試 & # 影片");
  for (const invalid of ["file:///tmp/video.mp4", "https://user:pass@example.com", "javascript:alert(1)"]) {
    assert.throws(() => importUrl(invalid, ""));
  }
});

test("less common YouTube hosts and /live/ links are still YouTube", () => {
  assert.deepEqual(parseVideoRef("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), { source: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideoRef("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), { source: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideoRef("https://www.youtube.com/live/dQw4w9WgXcQ?feature=share"), { source: "youtube", id: "dQw4w9WgXcQ" });
});
