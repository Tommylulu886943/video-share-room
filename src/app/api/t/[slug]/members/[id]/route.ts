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
import { parseMemberFields, validateAttributes } from "@/lib/member-fields";

export const runtime = "nodejs";

const schema = z.object({
  canUpload: z.boolean().optional(),
  name: z.string().trim().min(1, "請填寫名稱").max(60).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
}).refine(
  (input) => input.canUpload !== undefined || input.name !== undefined || input.attributes !== undefined,
  "請提供要修改的資料",
);

export const PATCH = route(
  async (
    req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const input = schema.parse(await readJson(req));

    const membership = await prisma.membership.findUnique({ where: { id } });
    if (!membership || membership.tenantId !== ctx.tenant.id) {
      throw new ApiError(404, "找不到此成員");
    }
    if (input.canUpload !== undefined && membership.status !== MembershipStatus.APPROVED) {
      throw new ApiError(400, "只能設定已核可成員的上傳權限");
    }
    if (input.canUpload !== undefined && membership.role === TenantRole.ADMIN) {
      throw new ApiError(400, "管理者本來就能上傳");
    }

    const attributes = input.attributes === undefined
      ? undefined
      : validateAttributes(parseMemberFields(ctx.tenant.memberFields), input.attributes);
    await prisma.membership.update({
      where: { id },
      data: {
        ...(input.canUpload !== undefined ? { canUpload: input.canUpload } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(attributes !== undefined
          ? { attributes: JSON.stringify(attributes), level: attributes.level ?? "" }
          : {}),
      },
    });

    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: input.canUpload !== undefined ? "member.upload_permission" : "member.update",
      summary: input.canUpload !== undefined
        ? `${input.canUpload ? "授予" : "取消"} ${membership.name} 的上傳權限`
        : `修改了 ${membership.name} 的成員資料`,
    });

    return jsonOk({ updated: true });
  },
);

export const DELETE = route(
  async (
    _req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const membership = await prisma.membership.findUnique({ where: { id } });

    if (!membership || membership.tenantId !== ctx.tenant.id) {
      throw new ApiError(404, "找不到此成員");
    }
    if (membership.role === TenantRole.ADMIN) {
      throw new ApiError(400, "不可踢除社團管理者");
    }

    await prisma.membership.delete({ where: { id } });
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "member.remove",
      summary: `將 ${membership.name} 踢出社團`,
    });

    return jsonOk({ removed: true });
  },
);
