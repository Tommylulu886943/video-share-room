import { prisma } from "@/lib/db";
import { tagCreateSchema } from "@/lib/validation";
import {
  ApiError,
  jsonOk,
  readJson,
  requireTenantContext,
  route,
} from "@/lib/api";

export const runtime = "nodejs";

export const POST = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { ctx } = await requireTenantContext(slug, { admin: true });
    const { name } = tagCreateSchema.parse(await readJson(req));

    const exists = await prisma.tag.findUnique({
      where: { tenantId_name: { tenantId: ctx.tenant.id, name } },
    });
    if (exists) throw new ApiError(409, "標籤已存在");

    const count = await prisma.tag.count({ where: { tenantId: ctx.tenant.id } });
    const tag = await prisma.tag.create({
      data: { tenantId: ctx.tenant.id, name, sortOrder: count },
    });
    return jsonOk(tag);
  },
);
