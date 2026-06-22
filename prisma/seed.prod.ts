import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma/client";

// Production seed: ensures ONE super admin exists. No demo data, no wiping.
// Safe to re-run (idempotent). Real clubs are created via the /admin UI.
const tursoUrl = process.env.TURSO_DATABASE_URL;
const adapter = tursoUrl
  ? new PrismaLibSql({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
  : new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = process.env.SEED_SUPERADMIN_USERNAME;
  const email = process.env.SEED_SUPERADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!username || !email || !password) {
    throw new Error(
      "Set SEED_SUPERADMIN_USERNAME, SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD.",
    );
  }
  if (password.length < 8) {
    throw new Error("SEED_SUPERADMIN_PASSWORD must be at least 8 characters.");
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });

  if (existing) {
    // Don't silently reset an existing account's password — just ensure the role.
    await prisma.user.update({
      where: { id: existing.id },
      data: { platformRole: "SUPER_ADMIN", emailVerified: true },
    });
    console.log(
      `Super admin already existed (${existing.username}); ensured SUPER_ADMIN role. No password change.`,
    );
  } else {
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        emailVerified: true,
        platformRole: "SUPER_ADMIN",
      },
    });
    console.log(`Created super admin: ${user.username} <${user.email}>`);
  }

  console.log("Production seed complete. Log in and create clubs at /admin.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
