import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, jsonOk, readJson, requireTenantContext, route } from "@/lib/api";
import { validateAccessMemberships } from "@/lib/videos";
import { auditActor, recordAudit } from "@/lib/audit";

const schema = z.object({
  visibility: z.enum(["PUBLIC", "RESTRICTED"]),
  accessMembershipIds: z.array(z.string().min(1)).max(10000),
});

export function taxonomyPermissionsRoute(kind: "category" | "tag") {
  return route(async (req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const item = kind === "category"
      ? await prisma.category.findFirst({ where: { id, tenantId: ctx.tenant.id } })
      : await prisma.tag.findFirst({ where: { id, tenantId: ctx.tenant.id } });
    if (!item) throw new ApiError(404, "找不到分類或標籤");
    const input = schema.parse(await readJson(req));
    const ids = await validateAccessMemberships(ctx.tenant.id, input.accessMembershipIds);
    const data = {
      visibility: input.visibility,
      access: { deleteMany: {}, create: (input.visibility === "PUBLIC" ? [] : ids).map(membershipId => ({ membershipId })) },
    };
    if (kind === "category") await prisma.category.update({ where: { id }, data });
    else await prisma.tag.update({ where: { id }, data });
    await recordAudit({ tenantId: ctx.tenant.id, ...auditActor(session, ctx),
      action: kind + ".permissions", summary: "更新「" + item.name + "」可見權限：" + (input.visibility === "PUBLIC" ? "不額外限制" : "指定會員（" + ids.length + " 人）"),
    });
    return jsonOk({ updated: true });
  });
}
