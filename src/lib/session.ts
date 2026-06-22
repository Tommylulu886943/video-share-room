import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySessionToken,
  type SessionClaims,
} from "@/lib/auth";

export interface SessionMembership {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  brandColor: string;
  brandLogo: string | null;
  role: string;
  status: string;
  canUpload: boolean;
  name: string;
  level: string;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  platformRole: string;
  memberships: SessionMembership[];
}

/** Load a user and their memberships into the session shape (no cookie read). */
export async function loadSessionUser(
  userId: string,
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { tenant: true },
        orderBy: { appliedAt: "asc" },
      },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    platformRole: user.platformRole,
    memberships: user.memberships.map((m) => ({
      id: m.id,
      tenantId: m.tenantId,
      tenantSlug: m.tenant.slug,
      tenantName: m.tenant.name,
      brandColor: m.tenant.brandColor,
      brandLogo: m.tenant.brandLogo,
      role: m.role,
      status: m.status,
      canUpload: m.canUpload,
      name: m.name,
      level: m.level,
    })),
  };
}

/**
 * Load the current user from the session cookie, with fresh memberships.
 * Cached per-request so multiple callers in one render share one DB hit.
 * Returns null for guests.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  return loadSessionUser(claims.sub);
});

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await signSession(claims);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}
