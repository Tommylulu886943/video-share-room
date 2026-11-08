// Timestamped member notes against a real (temp) SQLite database: who can see,
// write, edit and delete, and what survives account / video deletion.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import type { TenantContext } from "../src/lib/tenant";
import { createNoteSchema, updateNoteSchema } from "../src/lib/video-notes";

const dir = mkdtempSync(path.join(tmpdir(), "video-notes-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db").replaceAll("\\", "/")}`;
delete process.env.TURSO_DATABASE_URL;

type Db = typeof import("../src/lib/db");
type Store = typeof import("../src/lib/video-notes-store");
let prisma: Db["prisma"];
let store: Store;
let tenant: { id: string };
let other: { id: string };

before(async () => {
  const sql = createClient({ url: process.env.DATABASE_URL! });
  for (const name of readdirSync("prisma/migrations").filter((n) => /^\d/.test(n)).sort()) {
    await sql.executeMultiple(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  }
  sql.close();
  ({ prisma } = await import("../src/lib/db"));
  store = await import("../src/lib/video-notes-store");
  tenant = await prisma.tenant.create({ data: { name: "Club", slug: "club" } });
  other = await prisma.tenant.create({ data: { name: "Other", slug: "other" } });
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
async function member(tenantId: string, isAdmin = false) {
  const i = ++n;
  const user = await prisma.user.create({ data: { username: `user${i}`, email: `u${i}@test.invalid`, passwordHash: "x" } });
  const m = await prisma.membership.create({ data: { userId: user.id, tenantId, name: `M${i}`, level: "", status: "APPROVED" } });
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const ctx = { tenant: t, membership: { id: m.id }, isAdmin, isMember: true, canUpload: isAdmin } as unknown as TenantContext;
  return { user, membership: m, ctx, actor: store.noteActor(user.id, ctx) };
}
const newVideo = (visibility = "PUBLIC", tenantId = tenant.id) =>
  prisma.video.create({ data: { tenantId, source: "youtube", youtubeId: `v${++n}`, title: "t", visibility } });
const status = async (p: Promise<unknown>) =>
  p.then(
    () => 200,
    (e: { status?: number }) => e.status ?? 500,
  );

test("notes are shared with everyone who can view the video, sorted by time, with the author shown", async () => {
  const alice = await member(tenant.id);
  const bob = await member(tenant.id);
  const video = await newVideo();
  await store.createNote(video.id, alice.actor, { kind: "point", startMs: 121_000, body: "注意左手" });
  await store.createNote(video.id, bob.actor, { kind: "focus", startMs: 25_000, body: "出鼻面的時機" });
  await store.createNote(video.id, bob.actor, { kind: "insight", startMs: 121_000, body: "同一段的第二則" });

  const seenByAlice = await store.listNotes(video.id, alice.actor);
  assert.deepEqual(
    seenByAlice.map((x) => [x.startMs, x.kind, x.author?.username, x.mine, x.canDelete]),
    [
      [25_000, "focus", bob.user.username, false, false],
      [121_000, "point", alice.user.username, true, true],
      [121_000, "insight", bob.user.username, false, false],
    ],
  );
  // Notes belong to their video only.
  assert.deepEqual(await store.listNotes((await newVideo()).id, alice.actor), []);
});

test("only the author edits; author or a tenant admin deletes; ids from another video 404", async () => {
  const alice = await member(tenant.id);
  const bob = await member(tenant.id);
  const admin = await member(tenant.id, true);
  const video = await newVideo();
  const elsewhere = await newVideo();
  const note = await store.createNote(video.id, alice.actor, { kind: "insight", startMs: 5_000, body: "原本" });

  assert.equal(await status(store.updateNote(video.id, note.id, bob.actor, { body: "改掉" })), 403);
  assert.equal(await status(store.updateNote(video.id, note.id, admin.actor, { body: "改掉" })), 403);
  assert.equal(await status(store.updateNote(elsewhere.id, note.id, alice.actor, { body: "改掉" })), 404);
  const edited = await store.updateNote(video.id, note.id, alice.actor, { body: "修正後", kind: "point" });
  assert.equal(edited.body, "修正後");
  assert.equal(edited.kind, "point");
  assert.equal(edited.startMs, 5_000); // untouched fields stay

  assert.equal(await status(store.deleteNote(video.id, note.id, bob.actor)), 403);
  assert.equal(await status(store.deleteNote(elsewhere.id, note.id, admin.actor)), 404);
  await store.deleteNote(video.id, note.id, admin.actor); // moderation
  assert.equal(await prisma.videoNote.count({ where: { id: note.id } }), 0);

  const own = await store.createNote(video.id, bob.actor, { kind: "insight", startMs: 0, body: "自己刪" });
  await store.deleteNote(video.id, own.id, bob.actor);
  assert.equal(await prisma.videoNote.count({ where: { videoId: video.id } }), 0);
});

test("visibility: restricted videos and other clubs' videos are not reachable for notes", async () => {
  const allowed = await member(tenant.id);
  const plain = await member(tenant.id);
  const outsiderAdmin = await member(other.id, true);
  const restricted = await newVideo("RESTRICTED");
  await prisma.videoAccess.create({ data: { videoId: restricted.id, membershipId: allowed.membership.id } });

  assert.equal((await store.findNoteVideo(allowed.ctx, restricted.id))?.id, restricted.id);
  assert.equal(await store.findNoteVideo(plain.ctx, restricted.id), null);
  assert.equal(await store.findNoteVideo(outsiderAdmin.ctx, restricted.id), null);
});

test("a deleted account keeps its notes (author shown as gone); deleting the video removes them", async () => {
  const leaver = await member(tenant.id);
  const viewer = await member(tenant.id);
  const video = await newVideo();
  await store.createNote(video.id, leaver.actor, { kind: "point", startMs: 1_000, body: "留下來的筆記" });
  await prisma.user.delete({ where: { id: leaver.user.id } });
  const [kept] = await store.listNotes(video.id, viewer.actor);
  assert.equal(kept.body, "留下來的筆記");
  assert.equal(kept.author, null);
  assert.equal(kept.mine, false);

  await prisma.video.delete({ where: { id: video.id } });
  assert.equal(await prisma.videoNote.count({ where: { videoId: video.id } }), 0);
});

test("input validation: timestamp must be integer ms, body trimmed and bounded, kind known", () => {
  assert.deepEqual(createNoteSchema.parse({ startMs: 121_000, body: "  面  " }), { kind: "insight", startMs: 121_000, body: "面" });
  for (const bad of [
    { startMs: 1.5, body: "x" },
    { startMs: -1, body: "x" },
    { startMs: 0, body: "   " },
    { startMs: 0, body: "x".repeat(1001) },
    { startMs: 0, body: "x", kind: "todo" },
  ]) {
    assert.equal(createNoteSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(updateNoteSchema.safeParse({}).success, false);
  assert.equal(updateNoteSchema.safeParse({ kind: "focus" }).success, true);
});
