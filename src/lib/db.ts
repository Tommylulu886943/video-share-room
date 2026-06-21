import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

// Reuse a single PrismaClient across hot reloads in dev to avoid exhausting
// connections (Next.js re-evaluates modules on every change).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * libSQL works for both targets:
 *  - production: a hosted Turso database (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN),
 *    which is serverless-friendly (HTTP) — required on Vercel.
 *  - local dev: a plain SQLite file via DATABASE_URL ("file:./dev.db").
 */
function createClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const adapter = tursoUrl
    ? new PrismaLibSql({
        url: tursoUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
    : new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
