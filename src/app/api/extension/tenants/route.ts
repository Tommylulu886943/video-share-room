import { jsonOk, requireUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";

export const GET = route(async () => {
  const session = await requireUser();
  const candidates = session.platformRole === "SUPER_ADMIN"
    ? await prisma.tenant.findMany({ select: { slug: true }, orderBy: { name: "asc" } })
    : session.memberships.map((m) => ({ slug: m.tenantSlug }));
  const contexts = await Promise.all(candidates.map(({ slug }) => resolveTenantContext(slug, session)));
  const tenants = contexts.flatMap((ctx) => ctx?.canUpload
    ? [{ slug: ctx.tenant.slug, name: ctx.tenant.name }] : []);
  return jsonOk({ tenants }, { headers: { "Cache-Control": "private, no-store" } });
});
