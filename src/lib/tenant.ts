import { cache } from "react";
import { prisma } from "@/lib/db";
import { MembershipStatus, PlatformRole, TenantRole } from "@/lib/constants";
import type { SessionMembership, SessionUser } from "@/lib/session";
import type { Tenant } from "@/generated/prisma/client";

export interface TenantContext {
  tenant: Tenant;
  /** The user's membership in this tenant, if any (null for a super admin with none). */
  membership: SessionMembership | null;
  /** True for a super admin OR an approved ADMIN membership. */
  isAdmin: boolean;
  /** True if the user may view this tenant's content (approved member, admin, or super admin). */
  isMember: boolean;
  /** True if the user may upload videos (admin, super admin, or an approved member granted canUpload). */
  canUpload: boolean;
  isSuperAdmin: boolean;
}

/**
 * Resolve what a session may do inside the tenant identified by `slug`.
 * Returns null only when the tenant does not exist. Callers gate on
 * `isMember` / `isAdmin`. This is the single source of truth for FR-4 access.
 */
export const resolveTenantContext = cache(async function resolveTenantContext(
  slug: string,
  session: SessionUser | null,
): Promise<TenantContext | null> {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;

  const isSuperAdmin = session?.platformRole === PlatformRole.SUPER_ADMIN;
  const membership =
    session?.memberships.find((m) => m.tenantId === tenant.id) ?? null;

  const approved = membership?.status === MembershipStatus.APPROVED;
  const isTenantAdmin = approved && membership?.role === TenantRole.ADMIN;

  const isAdmin = isSuperAdmin || isTenantAdmin;
  const isMember = isAdmin || approved;
  const canUpload = isAdmin || (approved && Boolean(membership?.canUpload));

  return { tenant, membership, isAdmin, isMember, canUpload, isSuperAdmin };
});
