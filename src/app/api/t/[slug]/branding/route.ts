import { prisma } from "@/lib/db";
import { brandingSchema } from "@/lib/validation";
import {
  jsonOk,
  readJson,
  requireTenantContext,
  route,
} from "@/lib/api";

export const runtime = "nodejs";

export const PATCH = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { ctx } = await requireTenantContext(slug, { admin: true });
    const input = brandingSchema.parse(await readJson(req));

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenant.id },
      data: {
        name: input.name ?? undefined,
        brandColor: input.brandColor ?? undefined,
        // undefined = unchanged; null/"" = clear the logo.
        brandLogo:
          input.brandLogo === undefined ? undefined : input.brandLogo || null,
      },
    });
    return jsonOk(tenant);
  },
);
