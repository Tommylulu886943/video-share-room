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
      // Only hit the network when we actually need to derive something: the
      // source changed (need a fresh title + cover) or no title was supplied.
      const provided = input.title?.trim() || null;
      const needMeta = sourceChanged || !provided;
      const { rawTitle, thumbnailUrl } = needMeta
        ? await resolveVideoMeta(provided, finalSource, finalId)
        : { rawTitle: provided.slice(0, 140), thumbnailUrl: null };
      const { recordedOn: prefixDate, title } = extractDatePrefix(rawTitle);
      data.title = title;
      if (sourceChanged) data.thumbnailUrl = thumbnailUrl;
      if (input.recordedOn === undefined && prefixDate) {
        data.recordedOn = prefixDate;
      }
    }
    // Manual cover URL wins; empty clears it (back to auto/placeholder).
    if (input.thumbnailUrl !== undefined) {
      data.thumbnailUrl = input.thumbnailUrl?.trim() || null;
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

    // Replace tags and the access allow-list via nested writes in a single
    // update. The previous interactive $transaction + createMany throws on the
    // libSQL/Turso adapter in production; nested relation writes (the same shape
    // the create route uses) run as one atomic statement batch instead. Validate
    // the ids first (reads), then write once.
    if (input.tagIds !== undefined) {
      const tagIds = await validateTags(ctx.tenant.id, input.tagIds);
      data.tags = {
        deleteMany: {},
        create: tagIds.map((tagId) => ({ tagId })),
      };
    }

    if (finalVisibility === Visibility.PUBLIC) {
      // Public videos carry no allow-list.
      data.access = { deleteMany: {} };
    } else if (input.accessMembershipIds !== undefined) {
      const ids = await validateAccessMemberships(
        ctx.tenant.id,
        input.accessMembershipIds,
      );
      data.access = {
        deleteMany: {},
        create: ids.map((membershipId) => ({ membershipId })),
      };
    }

    await prisma.video.update({ where: { id }, data });

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
