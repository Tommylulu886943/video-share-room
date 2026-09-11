import assert from "node:assert/strict";
import { fetchLinkThumbnail, parsePreviewImage } from "../src/lib/link-preview";

async function main() {
  assert.equal(parsePreviewImage(`<meta content='/cover.jpg?a=1&amp;b=2' property='og:image'>`, "https://missav.live/example"), "https://missav.live/cover.jpg?a=1&b=2");
  assert.equal(parsePreviewImage(`<meta name="twitter:image" content="//cdn.example/cover.jpg">`, "https://www.xvideos.com/example"), "https://cdn.example/cover.jpg");
  assert.equal(parsePreviewImage(`<meta property="og:image" content="javascript:alert(1)">`, "https://missav.live/"), null);
  const original = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(`<meta property="og:image" content="https://cdn.example/cover.jpg">`, { headers: { "content-type": "text/html" } });
    };
    for (const host of ["missav.live", "www.pornhub.com", "www.xvideos.com"]) {
      assert.equal(await fetchLinkThumbnail(`https://${host}/example`), "https://cdn.example/cover.jpg");
    }
    for (const url of ["https://localhost/", "https://missav.live.evil.com/", "https://www.pornhub.com@127.0.0.1/", "https://missav.live:8443/"]) {
      assert.equal(await fetchLinkThumbnail(url), null);
    }
    assert.equal(calls.length, 3);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
    assert.equal(await fetchLinkThumbnail("https://missav.live/example"), null);
    globalThis.fetch = async () => new Response("blocked", { status: 403 });
    assert.equal(await fetchLinkThumbnail("https://www.pornhub.com/example"), null);
    globalThis.fetch = async () => { throw new Error("timeout"); };
    assert.equal(await fetchLinkThumbnail("https://www.xvideos.com/example"), null);
  } finally { globalThis.fetch = original; }
  console.log("Link preview checks passed");
}
void main();
