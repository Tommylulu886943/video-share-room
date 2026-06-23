import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/constants";
import { videoCreateSchema } from "@/lib/validation";
import { parseVideoRef } from "@/lib/sources";
import {
  extractDatePrefix,
  parseRecordedOn,
  resolveVideoMeta,
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
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

// Upload allowed for admins, super admins, or members granted canUpload.
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { upload: true });
    const input = videoCreateSchema.parse(await readJson(req));

    const ref = parseVideoRef(input.youtube);
    if (!ref) throw new ApiError(400, "無法辨識的 YouTube 或 Bilibili 連結");

    // Blank title → use the source's own title; then peel any leading YYMMDD date.
    const { rawTitle, thumbnailUrl } = await resolveVideoMeta(
      input.title,
      ref.source,
      ref.id,
    );
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
        source: ref.source,
        youtubeId: ref.id,
        thumbnailUrl,
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

    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "video.create",
      summary: `上傳影片「${video.title}」`,
    });

    return jsonOk(video, { status: 201 });
  },
);
