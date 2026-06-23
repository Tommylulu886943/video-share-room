import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/constants";
import { videoUpdateSchema } from "@/lib/validation";
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
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

async function loadOwned(tenantId: string, id: string) {
  const v = await prisma.video.findUnique({ where: { id } });
  if (!v || v.tenantId !== tenantId) throw new ApiError(404, "找不到影片");
  return v;
}

export const PATCH = route(
  async (
    req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const video = await loadOwned(ctx.tenant.id, id);
    const input = videoUpdateSchema.parse(await readJson(req));

    const data: Prisma.VideoUpdateInput = {};

    // A non-empty link/ID switches the video (and source); blank = keep existing.
    let finalSource = video.source;
    let finalId = video.youtubeId;
    const sourceChanged = Boolean(input.youtube);
    if (input.youtube) {
      const ref = parseVideoRef(input.youtube);
      if (!ref) throw new ApiError(400, "無法辨識的 YouTube 或 Bilibili 連結");
      finalSource = ref.source;
      finalId = ref.id;
      data.source = ref.source;
      data.youtubeId = ref.id;
    }
    if (input.title !== undefined || sourceChanged) {
      // Resolve the title (blank → the source's own); refresh the cover when the
      // source changed; peel any leading YYMMDD date into recordedOn.
      const { rawTitle, thumbnailUrl } = await resolveVideoMeta(
        input.title ?? null,
        finalSource,
        finalId,
      );
      const { recordedOn: prefixDate, title } = extractDatePrefix(rawTitle);
      data.title = title;
      if (sourceChanged) data.thumbnailUrl = thumbnailUrl;
      if (input.recordedOn === undefined && prefixDate) {
        data.recordedOn = prefixDate;
      }
    }
    if (input.notes !== undefined) data.notes = input.notes || null;
    if (input.recordedOn !== undefined) {
      data.recordedOn = parseRecordedOn(input.recordedOn || undefined);
    }
    if (input.visibility !== undefined) data.visibility = input.visibility;
    if (input.categoryId !== undefined) {
      const categoryId = await validateCategory(ctx.tenant.id, input.categoryId);
      data.category = categoryId
        ? { connect: { id: categoryId } }
        : { disconnect: true };
    }

    const finalVisibility = input.visibility ?? video.visibility;

    await prisma.$transaction(async (tx) => {
      await tx.video.update({ where: { id }, data });

      if (input.tagIds !== undefined) {
        const tagIds = await validateTags(ctx.tenant.id, input.tagIds);
        await tx.videoTag.deleteMany({ where: { videoId: id } });
        if (tagIds.length) {
          await tx.videoTag.createMany({
            data: tagIds.map((tagId) => ({ videoId: id, tagId })),
          });
        }
      }

      if (finalVisibility === Visibility.PUBLIC) {
        // Public videos carry no allow-list.
        await tx.videoAccess.deleteMany({ where: { videoId: id } });
      } else if (input.accessMembershipIds !== undefined) {
        const ids = await validateAccessMemberships(
          ctx.tenant.id,
          input.accessMembershipIds,
        );
        await tx.videoAccess.deleteMany({ where: { videoId: id } });
        if (ids.length) {
          await tx.videoAccess.createMany({
            data: ids.map((membershipId) => ({ videoId: id, membershipId })),
          });
        }
      }
    });

    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "video.update",
      summary: `編輯影片「${video.title}」`,
    });

    return jsonOk({ updated: true });
  },
);

export const DELETE = route(
  async (
    _req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const video = await loadOwned(ctx.tenant.id, id);
    await prisma.video.delete({ where: { id } });
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "video.delete",
      summary: `刪除影片「${video.title}」`,
    });
    return jsonOk({ deleted: true });
  },
);
