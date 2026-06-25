import { prisma } from "@/lib/db";
import { canViewVideo } from "@/lib/access";
import {
  ApiError,
  jsonOk,
  requireTenantContext,
  route,
} from "@/lib/api";

export const runtime = "nodejs";

// Count a view. Member-gated and access-checked so restricted videos only
// accrue views from people allowed to see them.
export const POST = route(
  async (
    _req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { ctx } = await requireTenantContext(slug);

    const video = await prisma.video.findUnique({
      where: { id },
      include: { access: { select: { membershipId: true } } },
    });
    if (!video || video.tenantId !== ctx.tenant.id || !canViewVideo(ctx, video)) {
      throw new ApiError(404, "找不到影片");
    }

    await prisma.video.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
    return jsonOk({ ok: true });
  },
);
