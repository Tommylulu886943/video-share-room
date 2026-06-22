import { prisma } from "@/lib/db";
import { settingsSchema } from "@/lib/validation";
import { jsonOk, readJson, requireTenantContext, route } from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const PATCH = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const input = settingsSchema.parse(await readJson(req));

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenant.id },
      data: {
        requireEmailVerification: input.requireEmailVerification ?? undefined,
        requireApproval: input.requireApproval ?? undefined,
      },
    });
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "settings.update",
      summary: `更新註冊設定（需審核：${tenant.requireApproval ? "開" : "關"}、需 email 驗證：${tenant.requireEmailVerification ? "開" : "關"}）`,
    });
    return jsonOk({
      requireEmailVerification: tenant.requireEmailVerification,
      requireApproval: tenant.requireApproval,
    });
  },
);
