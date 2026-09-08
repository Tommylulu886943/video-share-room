import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { viewableCategoryWhere, viewableTagWhere, viewableVideoWhere } from "../src/lib/access";
import type { TenantContext } from "../src/lib/tenant";

test("taxonomy permissions: inherited, intersected, tenant scoped, revoked and enforced for uploads", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "taxonomy-access-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "test.db").replaceAll("\\", "/")}`;
  delete process.env.TURSO_DATABASE_URL;
  const sql = createClient({ url: process.env.DATABASE_URL });
  for (const name of readdirSync("prisma/migrations").filter(n => /^\d/.test(n)).sort()) {
    await sql.executeMultiple(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  }
  sql.close();
  const { prisma } = await import("../src/lib/db");
  const { validateCategory, validateTags, validateAccessMemberships } = await import("../src/lib/videos");
  try {
    const tenant = await prisma.tenant.create({ data: { name: "Club", slug: "club" } });
    const other = await prisma.tenant.create({ data: { name: "Other", slug: "other" } });
    const memberships = [];
    for (const [i, tenantId] of [tenant.id, tenant.id, other.id].entries()) {
      const user = await prisma.user.create({ data: { username: `user${i}`, email: `${i}@test.invalid`, passwordHash: "unused" } });
      memberships.push(await prisma.membership.create({ data: { userId: user.id, tenantId, name: `Member ${i}`, level: "", status: "APPROVED" } }));
    }
    const [alice, bob, outsider] = memberships;
    const ctx = (id: string, isAdmin = false) => ({ tenant, membership: { id }, isAdmin, isMember: true } as TenantContext);
    const a = ctx(alice.id), b = ctx(bob.id), admin = ctx(bob.id, true);
    const parent = await prisma.category.create({ data: { tenantId: tenant.id, name: "Private", visibility: "RESTRICTED", access: { create: [{ membershipId: alice.id }] } } });
    const child = await prisma.category.create({ data: { tenantId: tenant.id, parentId: parent.id, name: "Child" } });
    const tag = await prisma.tag.create({ data: { tenantId: tenant.id, name: "Private tag", visibility: "RESTRICTED", access: { create: [{ membershipId: alice.id }] } } });
    const publicVideo = await prisma.video.create({ data: { tenantId: tenant.id, title: "Public", youtubeId: "public" } });
    const privateVideo = await prisma.video.create({ data: { tenantId: tenant.id, title: "Private", youtubeId: "private", categoryId: child.id, tags: { create: [{ tagId: tag.id }] } } });
    const visible = async (context: TenantContext) => (await prisma.video.findMany({ where: viewableVideoWhere(context) })).map(v => v.id).sort();
    assert.deepEqual(await visible(a), [publicVideo.id, privateVideo.id].sort());
    assert.deepEqual(await visible(b), [publicVideo.id]);
    assert.equal(await prisma.category.count({ where: viewableCategoryWhere(b) }), 0);
    assert.equal(await prisma.tag.count({ where: viewableTagWhere(b) }), 0);
    assert.equal(await prisma.video.findFirst({ where: { AND: [{ id: privateVideo.id }, viewableVideoWhere(b)] } }), null);
    await assert.rejects(validateCategory(tenant.id, child.id, b));
    await assert.rejects(validateTags(tenant.id, [tag.id], b));
    await assert.rejects(validateAccessMemberships(tenant.id, [outsider.id]));
    assert.equal(await validateCategory(tenant.id, child.id, a), child.id);
    await prisma.category.update({ where: { id: child.id }, data: { visibility: "RESTRICTED", access: { create: [{ membershipId: bob.id }] } } });
    assert.deepEqual(await visible(a), [publicVideo.id]);
    assert.deepEqual(await visible(b), [publicVideo.id]);
    assert.equal((await visible(admin)).length, 2);
    await prisma.category.update({ where: { id: child.id }, data: { visibility: "PUBLIC" } });
    const secondTag = await prisma.tag.create({ data: { tenantId: tenant.id, name: "Empty allowlist", visibility: "RESTRICTED" } });
    await prisma.videoTag.create({ data: { videoId: privateVideo.id, tagId: secondTag.id } });
    assert.deepEqual(await visible(a), [publicVideo.id]);
    await prisma.tagAccess.create({ data: { tagId: secondTag.id, membershipId: alice.id } });
    assert.equal((await visible(a)).length, 2);
    await prisma.video.update({ where: { id: privateVideo.id }, data: { visibility: "RESTRICTED" } });
    assert.deepEqual(await visible(a), [publicVideo.id]);
    await prisma.videoAccess.create({ data: { videoId: privateVideo.id, membershipId: alice.id } });
    assert.equal((await visible(a)).length, 2);
    await prisma.membership.update({ where: { id: alice.id }, data: { status: "REJECTED" } });
    assert.deepEqual(await visible(a), [publicVideo.id]);
    await assert.rejects(validateAccessMemberships(tenant.id, [alice.id]));
    await prisma.video.create({ data: { tenantId: other.id, title: "Other", youtubeId: "other" } });
    assert.equal((await visible(admin)).length, 2);
    await prisma.membership.delete({ where: { id: alice.id } });
    assert.equal(await prisma.categoryAccess.count(), 1); // Only Bob's child grant remains.
    assert.equal(await prisma.tagAccess.count(), 0);
  } finally {
    await prisma.$disconnect();
    // Windows libSQL may retain a file handle until the process exits.
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    try { rmSync(dir, { recursive: true, force: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EPERM" && (error as NodeJS.ErrnoException).code !== "EBUSY") throw error; }
  }
});
