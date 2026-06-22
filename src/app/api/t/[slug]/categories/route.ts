import { prisma } from "@/lib/db";
import { categoryCreateSchema } from "@/lib/validation";
import {
  ApiError,
  jsonOk,
  readJson,
  requireTenantContext,
  route,
} from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const { name, parentId } = categoryCreateSchema.parse(await readJson(req));

    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } });
      // Two-level only (D5): a sub-category's parent must be an existing top-level
      // category in this tenant.
      if (!parent || parent.tenantId !== ctx.tenant.id) {
        throw new ApiError(400, "找不到上層分類");
      }
      if (parent.parentId) {
        throw new ApiError(400, "分類僅支援兩層，子分類不能再有子分類");
      }
    }

    const count = await prisma.category.count({
      where: { tenantId: ctx.tenant.id, parentId: parentId ?? null },
    });
    const category = await prisma.category.create({
      data: {
        tenantId: ctx.tenant.id,
        name,
        parentId: parentId ?? null,
        sortOrder: count,
      },
    });

    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "category.create",
      summary: `新增${parentId ? "子" : ""}分類「${name}」`,
    });

    return jsonOk(category);
  },
);
