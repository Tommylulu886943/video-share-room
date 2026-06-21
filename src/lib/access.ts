import { Visibility } from "@/lib/constants";
import type { TenantContext } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Prisma `where` fragment that returns only the videos a context may see.
 * Admins/super-admins see everything in the tenant; regular members see
 * PUBLIC videos plus RESTRICTED videos whose allow-list includes their
 * membership. Restricted videos a member can't see never appear in any list,
 * search result, or feed (FR-3).
 */
export function viewableVideoWhere(ctx: TenantContext): Prisma.VideoWhereInput {
  if (ctx.isAdmin) {
    return { tenantId: ctx.tenant.id };
  }
  const membershipId = ctx.membership?.id ?? "__none__";
  return {
    tenantId: ctx.tenant.id,
    OR: [
      { visibility: Visibility.PUBLIC },
      {
        visibility: Visibility.RESTRICTED,
        access: { some: { membershipId } },
      },
    ],
  };
}

/** Whether a context may view a specific video (with its access rows loaded). */
export function canViewVideo(
  ctx: TenantContext,
  video: { visibility: string; access: { membershipId: string }[] },
): boolean {
  if (ctx.isAdmin) return true;
  if (video.visibility === Visibility.PUBLIC) return true;
  const membershipId = ctx.membership?.id;
  if (!membershipId) return false;
  return video.access.some((a) => a.membershipId === membershipId);
}
