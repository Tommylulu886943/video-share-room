import { prisma } from "@/lib/db";
import { canViewVideo } from "@/lib/access";
import {
  ApiError,
  jsonOk,
  requireTenantContext,
  route,
} from "@/lib/api";

export const runtime = "nodejs";

// Toggle the current user's favorite for a video (member + access gated).
export const POST = route(
  async (
    _req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug);

    const video = await prisma.video.findUnique({
      where: { id },
      include: { access: { select: { membershipId: true } } },
    });
    if (!video || video.tenantId !== ctx.tenant.id || !canViewVideo(ctx, video)) {
      throw new ApiError(404, "找不到影片");
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_videoId: { userId: session.id, videoId: id } },
    });
    if (existing) {
      await prisma.favorite.delete({
        where: { userId_videoId: { userId: session.id, videoId: id } },
      });
      return jsonOk({ favorited: false });
    }
    await prisma.favorite.create({ data: { userId: session.id, videoId: id } });
    return jsonOk({ favorited: true });
  },
);
