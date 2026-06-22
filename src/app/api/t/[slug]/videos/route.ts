import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/constants";
import { videoCreateSchema, parseYouTubeId } from "@/lib/validation";
import {
  extractDatePrefix,
  parseRecordedOn,
  resolveVideoTitle,
  validateAccessMemberships,
  validateCategory,
  validateTags,
} from "@/lib/videos";
import {
  ApiError,
  jsonOk,
  readJson,
  requireTenantContext,
  route,
} from "@/lib/api";

export const runtime = "nodejs";

// Upload is admin-only (D10).
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const input = videoCreateSchema.parse(await readJson(req));

    const youtubeId = parseYouTubeId(input.youtube);
    if (!youtubeId) throw new ApiError(400, "無法辨識的 YouTube 連結或 ID");

    // Blank title → use the YouTube title; then peel any leading YYMMDD date.
    const rawTitle = await resolveVideoTitle(input.title, youtubeId);
    const { recordedOn: prefixDate, title } = extractDatePrefix(rawTitle);
    const recordedOn =
      parseRecordedOn(input.recordedOn || undefined) ?? prefixDate;
    const categoryId = await validateCategory(ctx.tenant.id, input.categoryId);
    const tagIds = await validateTags(ctx.tenant.id, input.tagIds);
    const restricted = input.visibility === Visibility.RESTRICTED;
    const accessIds = restricted
      ? await validateAccessMemberships(ctx.tenant.id, input.accessMembershipIds)
      : [];

    const video = await prisma.video.create({
      data: {
        tenantId: ctx.tenant.id,
        youtubeId,
        title,
        notes: input.notes || null,
        recordedOn,
        visibility: input.visibility,
        categoryId,
        uploadedById: session.id,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        access: { create: accessIds.map((membershipId) => ({ membershipId })) },
      },
    });

    return jsonOk(video, { status: 201 });
  },
);
