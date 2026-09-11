import assert from "node:assert/strict";
import { test } from "node:test";
import { createVideo, request } from "../extensions/courtside/api.mjs";

test("direct import requires an explicit tenant and sends an authenticated POST", async () => {
  assert.throws(() => createVideo("", "https://example.com", "title"));
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://video-share-room.vercel.app/api/t/club/videos");
      assert.equal(options.credentials, "include");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { youtube: "https://example.com", title: "title", visibility: "PUBLIC" });
      return Response.json({ ok: true, data: { id: "saved" } });
    };
    assert.deepEqual(await createVideo("club", "https://example.com", "title"), { id: "saved" });
    globalThis.fetch = async () => Response.json({ ok: false }, { status: 401 });
    await assert.rejects(request("/api/extension/tenants"), (error) => error.status === 401);
    globalThis.fetch = async () => Response.json({ ok: false, error: "沒有上傳權限" }, { status: 403 });
    await assert.rejects(createVideo("club", "https://example.com", "title"), /沒有上傳權限/);
  } finally { globalThis.fetch = original; }
});
