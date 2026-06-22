import { z } from "zod";
import { prisma } from "@/lib/db";
import { MembershipStatus, TenantRole } from "@/lib/constants";
import {
  ApiError,
  jsonOk,
  readJson,
  requireTenantContext,
  route,
} from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const schema = z.object({ canUpload: z.boolean() });

export const PATCH = route(
  async (
    req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const { canUpload } = schema.parse(await readJson(req));

    const membership = await prisma.membership.findUnique({ where: { id } });
    if (!membership || membership.tenantId !== ctx.tenant.id) {
      throw new ApiError(404, "找不到此成員");
    }
    if (membership.status !== MembershipStatus.APPROVED) {
      throw new ApiError(400, "只能設定已核可的成員");
    }
    if (membership.role === TenantRole.ADMIN) {
      throw new ApiError(400, "管理者本來就能上傳");
    }

    await prisma.membership.update({ where: { id }, data: { canUpload } });

    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "member.upload_permission",
      summary: `${canUpload ? "授予" : "取消"} ${membership.name} 的上傳權限`,
    });

    return jsonOk({ canUpload });
  },
);
