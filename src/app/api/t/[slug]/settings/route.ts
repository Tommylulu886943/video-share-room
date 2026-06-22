import { prisma } from "@/lib/db";
import { settingsSchema } from "@/lib/validation";
import { jsonOk, readJson, requireTenantContext, route } from "@/lib/api";

export const runtime = "nodejs";

export const PATCH = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { ctx } = await requireTenantContext(slug, { admin: true });
    const input = settingsSchema.parse(await readJson(req));

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenant.id },
      data: {
        requireEmailVerification: input.requireEmailVerification ?? undefined,
        requireApproval: input.requireApproval ?? undefined,
      },
    });
    return jsonOk({
      requireEmailVerification: tenant.requireEmailVerification,
      requireApproval: tenant.requireApproval,
    });
  },
);
