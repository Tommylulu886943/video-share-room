import { prisma } from "@/lib/db";
import { viewableVideoWhere } from "@/lib/access";
import {
  ApiError,
  isUniqueViolation,
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

    const video = await prisma.video.findFirst({
      where: { AND: [{ id }, viewableVideoWhere(ctx)] },
      select: { id: true },
    });
    if (!video) {
      throw new ApiError(404, "找不到影片");
    }

    // Toggle without a read-then-write race: a delete that removed a row means
    // it was favorited; otherwise create (and treat "already there" from a
    // concurrent double-click as the same end state).
    const removed = await prisma.favorite.deleteMany({
      where: { userId: session.id, videoId: id },
    });
    if (removed.count > 0) return jsonOk({ favorited: false });
    try {
      await prisma.favorite.create({ data: { userId: session.id, videoId: id } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return jsonOk({ favorited: true });
  },
);
