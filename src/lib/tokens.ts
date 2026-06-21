import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { TokenPurpose } from "@/lib/constants";

const EMAIL_VERIFY_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export async function createEmailVerifyToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.token.create({
    data: {
      token,
      userId,
      purpose: TokenPurpose.EMAIL_VERIFY,
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
    },
  });
  return token;
}

export function emailVerifyLink(token: string): string {
  return `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

/** Validate (without consuming) a verification token; returns the userId or null. */
export async function peekEmailVerifyToken(
  token: string,
): Promise<string | null> {
  const row = await prisma.token.findUnique({ where: { token } });
  if (
    !row ||
    row.purpose !== TokenPurpose.EMAIL_VERIFY ||
    row.consumedAt ||
    row.expiresAt < new Date()
  ) {
    return null;
  }
  return row.userId;
}

/**
 * Validate & consume a verification token; returns the userId or null.
 * Consumption is atomic — a conditional write ensures only the first caller
 * succeeds (no double-consume / double admin-notification under races).
 */
export async function consumeEmailVerifyToken(
  token: string,
): Promise<string | null> {
  const row = await prisma.token.findUnique({ where: { token } });
  if (!row || row.purpose !== TokenPurpose.EMAIL_VERIFY) return null;

  const res = await prisma.token.updateMany({
    where: { token, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (res.count === 0) return null;
  return row.userId;
}
