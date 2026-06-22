import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

// Idempotently apply Prisma migration SQL to the configured database
// (Turso when TURSO_DATABASE_URL is set, else the local DATABASE_URL file).
// Tracks applied migrations in `_applied_migrations` so it is safe to re-run
// on every push (CI). No Turso CLI needed.
async function main() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("Set TURSO_DATABASE_URL (or DATABASE_URL).");

  const client = createClient({ url, authToken });

  const migDir = path.join(process.cwd(), "prisma", "migrations");
  const dirs = readdirSync(migDir)
    .filter((d) => /^\d/.test(d))
    .sort();

  await client.execute(
    "CREATE TABLE IF NOT EXISTS _applied_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const appliedRows = await client.execute("SELECT name FROM _applied_migrations");
  const applied = new Set(appliedRows.rows.map((r) => String(r.name)));

  const stamp = new Date().toISOString();
  const markApplied = (name: string) =>
    client.execute({
      sql: "INSERT OR IGNORE INTO _applied_migrations (name, applied_at) VALUES (?, ?)",
      args: [name, stamp],
    });

  // Bootstrap: a DB whose schema already exists but was never tracked (e.g. the
  // first manual `db:push:turso`). Record current migrations as applied without
  // re-running them, so we don't error on existing tables.
  if (applied.size === 0) {
    const t = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='Tenant'",
    );
    if (t.rows.length > 0) {
      for (const d of dirs) await markApplied(d);
      console.log(
        `Bootstrap: existing schema detected — marked ${dirs.length} migration(s) as applied. Nothing to run.`,
      );
      return;
    }
  }

  let ran = 0;
  for (const d of dirs) {
    if (applied.has(d)) {
      console.log(`skip ${d} (already applied)`);
      continue;
    }
    const sql = readFileSync(path.join(migDir, d, "migration.sql"), "utf8");
    process.stdout.write(`applying ${d} … `);
    await client.executeMultiple(sql);
    await markApplied(d);
    console.log("ok");
    ran++;
  }
  console.log(
    ran === 0
      ? "Up to date — no pending migrations."
      : `Applied ${ran} migration(s) to ${url.replace(/\?.*$/, "")}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
