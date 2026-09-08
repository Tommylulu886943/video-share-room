import type { TenantContext } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

/** Only approved memberships grant access. Admins bypass per-content restrictions. */
function taxonomyWhere(ctx: TenantContext) {
  if (ctx.isAdmin) return { tenantId: ctx.tenant.id };
  return { tenantId: ctx.tenant.id, OR: [
    { visibility: "PUBLIC" },
    { visibility: "RESTRICTED", access: { some: {
      membershipId: ctx.membership?.id ?? "__none__",
      membership: { tenantId: ctx.tenant.id, status: "APPROVED" },
    } } },
  ] };
}

export function viewableTagWhere(ctx: TenantContext): Prisma.TagWhereInput {
  return taxonomyWhere(ctx);
}

/** Child categories must satisfy both their own and their parent's allow-list. */
export function viewableCategoryWhere(ctx: TenantContext): Prisma.CategoryWhereInput {
  const own: Prisma.CategoryWhereInput = taxonomyWhere(ctx);
  if (ctx.isAdmin) return own;
  return { AND: [own, { OR: [{ parentId: null }, { parent: { is: own } }] }] };
}

/** Every applicable restriction is required, including every attached tag. */
export function viewableVideoWhere(ctx: TenantContext): Prisma.VideoWhereInput {
  if (ctx.isAdmin) return { tenantId: ctx.tenant.id };
  return { tenantId: ctx.tenant.id, AND: [
    { OR: [
      { visibility: "PUBLIC" },
      { visibility: "RESTRICTED", access: { some: {
        membershipId: ctx.membership?.id ?? "__none__",
        membership: { tenantId: ctx.tenant.id, status: "APPROVED" },
      } } },
    ] },
    { OR: [{ categoryId: null }, { category: { is: viewableCategoryWhere(ctx) } }] },
    { tags: { every: { tag: { is: viewableTagWhere(ctx) } } } },
  ] };
}
