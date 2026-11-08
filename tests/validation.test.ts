import assert from "node:assert/strict";
import { test } from "node:test";
import { videoCreateSchema } from "../src/lib/validation";

const base = { youtube: "dQw4w9WgXcQ", visibility: "PUBLIC" as const };

test("cover image URLs: only http(s) without credentials; blank clears", () => {
  assert.equal(videoCreateSchema.parse({ ...base, thumbnailUrl: "https://img.example/a.jpg" }).thumbnailUrl, "https://img.example/a.jpg");
  assert.equal(videoCreateSchema.parse({ ...base, thumbnailUrl: "" }).thumbnailUrl, "");
  for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "file:///etc/passwd", "https://user:pw@img.example/a.jpg", "not a url"]) {
    assert.throws(() => videoCreateSchema.parse({ ...base, thumbnailUrl: bad }), new RegExp("封面圖"), bad);
  }
});
