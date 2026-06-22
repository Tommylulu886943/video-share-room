import { prisma } from "@/lib/db";
import { categoryUpdateSchema } from "@/lib/validation";
import {
  ApiError,
  jsonOk,
  readJson,
  requireTenantContext,
  route,
} from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

async function loadOwned(tenantId: string, id: string) {
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat || cat.tenantId !== tenantId) throw new ApiError(404, "找不到分類");
  return cat;
}

export const PATCH = route(
  async (
    req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { ctx } = await requireTenantContext(slug, { admin: true });
    await loadOwned(ctx.tenant.id, id); // ensures the category belongs to this tenant
    const input = categoryUpdateSchema.parse(await readJson(req));

    if (input.parentId !== undefined) {
      if (input.parentId === id) throw new ApiError(400, "分類不能設為自己的上層");

      if (input.parentId) {
        const parent = await loadOwned(ctx.tenant.id, input.parentId);
        if (parent.parentId) {
          throw new ApiError(400, "分類僅支援兩層");
        }
        // The category being demoted to a child must not already have children.
        const childCount = await prisma.category.count({
          where: { parentId: id },
        });
        if (childCount > 0) {
          throw new ApiError(400, "此分類底下尚有子分類，無法移為子分類");
        }
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        parentId: input.parentId === undefined ? undefined : input.parentId,
        sortOrder: input.sortOrder ?? undefined,
      },
    });
    return jsonOk(updated);
  },
);

export const DELETE = route(
  async (
    _req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const cat = await loadOwned(ctx.tenant.id, id);
    // Children cascade; videos' categoryId is set null by the schema.
    await prisma.category.delete({ where: { id } });
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "category.delete",
      summary: `刪除分類「${cat.name}」`,
    });
    return jsonOk({ deleted: true });
  },
);
