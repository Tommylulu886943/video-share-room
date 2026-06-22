import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma/client";

// Reset a user's password. Reads the new password from env so it never lands in
// shell history args or chat. Usage:
//   ADMIN_IDENTIFIER=superadmin NEW_PASSWORD=... TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:set-admin-password
const tursoUrl = process.env.TURSO_DATABASE_URL;
const adapter = tursoUrl
  ? new PrismaLibSql({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
  : new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const identifier =
    process.env.ADMIN_IDENTIFIER || process.env.SEED_SUPERADMIN_EMAIL;
  const newPassword = process.env.NEW_PASSWORD;
  if (!identifier || !newPassword) {
    throw new Error("Set ADMIN_IDENTIFIER (username or email) and NEW_PASSWORD.");
  }
  if (newPassword.length < 8) {
    throw new Error("NEW_PASSWORD must be at least 8 characters.");
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier.toLowerCase() }] },
  });
  if (!user) throw new Error(`No user found for "${identifier}".`);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  console.log(`Password updated for ${user.username} <${user.email}>.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
