import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

// Apply all Prisma migration SQL files to the configured database (Turso when
// TURSO_DATABASE_URL is set, else the local DATABASE_URL file). No Turso CLI needed.
async function main() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("Set TURSO_DATABASE_URL (or DATABASE_URL).");

  const client = createClient({ url, authToken });
  const migDir = path.join(process.cwd(), "prisma", "migrations");
  const dirs = readdirSync(migDir)
    .filter((d) => /^\d/.test(d))
    .sort();

  for (const d of dirs) {
    const sql = readFileSync(path.join(migDir, d, "migration.sql"), "utf8");
    process.stdout.write(`applying ${d} … `);
    await client.executeMultiple(sql);
    console.log("ok");
  }
  console.log(`Schema applied to ${url.replace(/\?.*$/, "")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
