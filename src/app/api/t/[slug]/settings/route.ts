import { prisma } from "@/lib/db";
import { releaseUnverifiedApplicants } from "@/lib/members";
import { settingsSchema } from "@/lib/validation";
import { ApiError, jsonOk, readJson, requireTenantContext, route } from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const PATCH = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const input = settingsSchema.parse(await readJson(req));

    // Resolve the default category: "" / null clears it; an id must be a
    // category in this tenant.
    let defaultCategoryId: string | null | undefined;
    if (input.defaultCategoryId !== undefined) {
      const id = input.defaultCategoryId?.trim();
      if (id) {
        const cat = await prisma.category.findUnique({ where: { id } });
        if (!cat || cat.tenantId !== ctx.tenant.id) {
          throw new ApiError(400, "選擇的分類不存在");
        }
        defaultCategoryId = id;
      } else {
        defaultCategoryId = null;
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenant.id },
      data: {
        requireEmailVerification: input.requireEmailVerification ?? undefined,
        requireApproval: input.requireApproval ?? undefined,
        defaultCategoryId,
      },
    });
    // Verification switched off → applicants stuck waiting for a mail they'll
    // never need must not stay hidden from the review queue.
    if (ctx.tenant.requireEmailVerification && input.requireEmailVerification === false) {
      await releaseUnverifiedApplicants(ctx.tenant.id);
    }
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "settings.update",
      summary: "更新社團設定",
    });
    return jsonOk({
      requireEmailVerification: tenant.requireEmailVerification,
      requireApproval: tenant.requireApproval,
      defaultCategoryId: tenant.defaultCategoryId,
    });
  },
);
