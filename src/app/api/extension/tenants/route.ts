import { jsonOk, requireUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";

export const GET = route(async () => {
  const session = await requireUser();
  if (session.platformRole === "SUPER_ADMIN") {
    // A super admin can upload everywhere; no need to resolve a context per
    // tenant (that was one extra query per club).
    const tenants = await prisma.tenant.findMany({
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    });
    return jsonOk({ tenants }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const contexts = await Promise.all(
    session.memberships.map((m) => resolveTenantContext(m.tenantSlug, session)),
  );
  const tenants = contexts.flatMap((ctx) => ctx?.canUpload
    ? [{ slug: ctx.tenant.slug, name: ctx.tenant.name }] : []);
  return jsonOk({ tenants }, { headers: { "Cache-Control": "private, no-store" } });
});
