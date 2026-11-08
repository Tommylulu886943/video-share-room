import { prisma } from "@/lib/db";
import { tagCreateSchema } from "@/lib/validation";
import {
  ApiError,
  isUniqueViolation,
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
    const { name } = tagCreateSchema.parse(await readJson(req));

    const exists = await prisma.tag.findUnique({
      where: { tenantId_name: { tenantId: ctx.tenant.id, name } },
    });
    if (exists) throw new ApiError(409, "標籤已存在");

    const count = await prisma.tag.count({ where: { tenantId: ctx.tenant.id } });
    let tag;
    try {
      tag = await prisma.tag.create({
        data: { tenantId: ctx.tenant.id, name, sortOrder: count },
      });
    } catch (err) {
      // Two admins adding the same tag at once: the second must see 409, not 500.
      if (isUniqueViolation(err)) throw new ApiError(409, "標籤已存在");
      throw err;
    }
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "tag.create",
      summary: `新增標籤「${name}」`,
    });
    return jsonOk(tag);
  },
);
