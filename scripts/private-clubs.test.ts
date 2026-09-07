// Integration test: isolated SQLite database and Next dev server; no real accounts or email.
import assert from "node:assert/strict";
import { mkdtemp, cp, symlink, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@libsql/client";
import { SignJWT } from "jose";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { memberFieldsSchema, validateAttributes } from "../src/lib/member-fields";

async function main() {
  const root = process.cwd();
  // Keep the fixture on the same drive as node_modules (Next's Windows entries
  // cannot resolve junctions whose targets are on a different drive).
  const dir = await mkdtemp(path.join(path.dirname(root), "video-share-private-test-"));
  const url = `file:${path.join(dir, "test.db").replaceAll("\\", "/")}`;
  const sql = createClient({ url });
  const migrations = (await readdir(path.join(root, "prisma/migrations"))).filter(n => /^\d/.test(n)).sort();
  for (const migration of migrations) {
    if (migration === "20260908010000_private_clubs_member_fields") {
      await sql.execute("INSERT INTO Tenant (id, slug, name) VALUES ('legacy', 'legacy', 'Legacy Club')");
    }
    await sql.executeMultiple(await readFile(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8"));
  }
  const legacy = await sql.execute("SELECT memberFields FROM Tenant WHERE id = 'legacy'");
  assert.deepEqual(JSON.parse(String(legacy.rows[0].memberFields)), [{ id: "level", label: "級數", required: true }]);
  sql.close();
  const db = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  const users = await Promise.all(["owner", "outsider", "invitee", "wrong"].map(username => db.user.create({ data: {
    username, email: `${username}@example.test`, passwordHash: "unused", emailVerified: true,
    platformRole: username === "owner" ? "SUPER_ADMIN" : "USER",
  } })));
  const secret = "isolated-integration-test-secret-32-characters";
  const cookies = await Promise.all(users.map(async user => `fr_session=${await new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret))}`));
  for (const file of ["src", "public", "package.json", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs"]) {
    await cp(path.join(root, file), path.join(dir, file), { recursive: true });
  }
  await symlink(path.join(root, "node_modules"), path.join(dir, "node_modules"), "junction");
  await writeFile(path.join(dir, "next.config.ts"), "export default {};\n");
  const port = 3219;
  const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--port", String(port)], {
    cwd: dir, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "", AUTH_SECRET: secret, EMAIL_PROVIDER: "console", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", data => { logs += data; });
  server.stderr.on("data", data => { logs += data; });
  const base = `http://localhost:${port}`;
  async function request(route: string, cookie?: string, body?: unknown, method = "POST") {
    return fetch(base + route, { method: body === undefined ? "GET" : method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  }
  async function post(route: string, cookie: string | undefined, body: unknown, status = 200) {
    const res = await request(route, cookie, body);
    const data = await res.json();
    assert.equal(res.status, status, JSON.stringify(data));
    return data.data;
  }
  try {
    for (let attempt = 0; ; attempt++) {
      try { await fetch(base + "/login"); break; }
      catch { if (attempt > 90 || server.exitCode !== null) throw new Error(logs); await new Promise(r => setTimeout(r, 1000)); }
    }
    const fields = [{ id: "age", label: "年齡", required: true }, { id: "job", label: "職業", required: false }];
    assert.throws(() => memberFieldsSchema.parse(Array.from({ length: 11 }, (_, i) => ({ id: `f${i}`, label: `F${i}`, required: false }))));
    assert.throws(() => memberFieldsSchema.parse([fields[0], fields[0]]));
    assert.throws(() => validateAttributes(fields, { age: " " }));
    const create = { name: "Highly Confidential Club", slug: "hidden-club", isPrivate: true, memberFields: fields,
      adminUsername: "owner", adminEmail: "owner@example.test", adminName: "Owner", adminAttributes: { age: "30" } };
    await post("/api/admin/tenants", cookies[0], { ...create, adminAttributes: {} }, 422);
    const tenant = await post("/api/admin/tenants", cookies[0], create, 201);
    await post("/api/admin/tenants", cookies[1], { ...create, slug: "forbidden" }, 403);
    await post("/api/admin/tenants", cookies[0], { ...create, slug: "public-club", name: "Public Club", isPrivate: false }, 201);
    for (const [route, cookie] of [["/register", undefined], ["/join", cookies[1]]] as const) {
      const text = await (await request(route, cookie)).text();
      assert(!text.includes("Highly Confidential Club")); assert(!text.includes("hidden-club"));
      assert(text.includes("Public Club"));
    }
    assert.equal((await request("/t/hidden-club", cookies[1])).status, 404);
    for (const route of ["/admin", "/admin/users", "/t/hidden-club/admin/members", "/t/hidden-club/video/fake"]) {
      const text = await (await request(route, cookies[1])).text();
      assert(!text.includes("Highly Confidential Club"));
    }
    for (const route of ["/api/t/hidden-club/videos", "/api/t/hidden-club/tags", "/api/t/hidden-club/categories"]) {
      const res = await request(route, cookies[1], {}); assert.equal(res.status, 404);
    }
    const application = { tenantSlug: "hidden-club", name: "Applicant", attributes: { age: "20" } };
    await post("/api/auth/join", cookies[1], application, 404);
    await post("/api/auth/register", undefined, { ...application, username: "newuser", email: "new@example.test", password: "testpassword" }, 404);
    await post("/api/auth/join", cookies[1], { ...application, tenantSlug: "public-club", attributes: {} }, 422);
    await post("/api/auth/join", cookies[1], { ...application, tenantSlug: "public-club", attributes: { age: "20", unknown: "bad" } }, 422);
    await post("/api/auth/join", cookies[1], { ...application, tenantSlug: "public-club" });
    await post("/api/auth/register", undefined, { ...application, tenantSlug: "public-club", username: "newuser", email: "new@example.test", password: "testpassword" });
    const invite = { identifier: "invitee", name: "Invited", attributes: { age: "25", job: "Engineer" } };
    await post("/api/t/hidden-club/invitations", cookies[1], invite, 404);
    await post("/api/t/hidden-club/invitations", cookies[0], { ...invite, attributes: {} }, 422);
    const first = await post("/api/t/hidden-club/invitations", cookies[0], invite, 201);
    const second = await post("/api/t/hidden-club/invitations", cookies[0], invite, 201);
    await post("/api/auth/invitations/accept", cookies[2], { token: first.token }, 404);
    await post("/api/auth/invitations/accept", cookies[3], { token: second.token }, 404);
    assert(!(await (await request("/join", cookies[2])).text()).includes("Highly Confidential Club"));
    const result = await post("/api/auth/invitations/accept", cookies[2], { token: second.token });
    assert.equal(result.redirect, "/t/hidden-club");
    await post("/api/auth/invitations/accept", cookies[2], { token: second.token }, 404);
    assert.equal((await request("/t/hidden-club", cookies[2])).status, 200);
    await post("/api/t/hidden-club/invitations", cookies[2], invite, 403);
    const membership = await db.membership.findUniqueOrThrow({ where: { userId_tenantId: { userId: users[2].id, tenantId: tenant.id } } });
    assert.deepEqual(JSON.parse(membership.attributes), { age: "25", job: "Engineer" });
    await db.membership.update({ where: { id: membership.id }, data: { status: "REJECTED" } });
    assert(!(await (await request("/join", cookies[2])).text()).includes("Highly Confidential Club"));
    assert.equal((await request("/t/hidden-club", cookies[2])).status, 404);
    const expired = await post("/api/t/hidden-club/invitations", cookies[0], { ...invite, identifier: "wrong" }, 201);
    await db.invitation.updateMany({ where: { userId: users[3].id }, data: { expiresAt: new Date(0) } });
    await post("/api/auth/invitations/accept", cookies[3], { token: expired.token }, 404);
    const revoked = await post("/api/t/hidden-club/invitations", cookies[0], { ...invite, identifier: "wrong" }, 201);
    const row = await db.invitation.findFirstOrThrow({ where: { userId: users[3].id, consumedAt: null, expiresAt: { gt: new Date() } } });
    assert.equal((await request("/api/t/hidden-club/invitations", cookies[0], { id: row.id }, "DELETE")).status, 200);
    await post("/api/auth/invitations/accept", cookies[3], { token: revoked.token }, 404);
    console.log("PASS: privacy, creation permissions, public registration, custom validation/storage, invitation identity/replacement/replay/expiry/revocation.");
  } catch (error) { console.error(logs); throw error; }
  finally { server.kill(); await db.$disconnect(); console.log(`Isolated test artifacts: ${dir}`); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
