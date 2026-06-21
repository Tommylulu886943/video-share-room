import { prisma } from "@/lib/db";
import {
  ApiError,
  jsonOk,
  requireTenantContext,
  route,
} from "@/lib/api";

export const runtime = "nodejs";

export const DELETE = route(
  async (
    _req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { ctx } = await requireTenantContext(slug, { admin: true });

    const tag = await prisma.tag.findUnique({ where: { id } });
    if (!tag || tag.tenantId !== ctx.tenant.id) {
      throw new ApiError(404, "找不到標籤");
    }
    // VideoTag rows cascade on delete.
    await prisma.tag.delete({ where: { id } });
    return jsonOk({ deleted: true });
  },
);
