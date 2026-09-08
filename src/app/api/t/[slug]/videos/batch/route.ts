import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/constants";
import { videoBatchSchema, videoBatchUpdateSchema } from "@/lib/validation";
import { parseVideoRef, type VideoSource } from "@/lib/sources";
import {
  extractDatePrefix,
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

// Bulk create videos (admin, super admin, or members granted canUpload).
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { upload: true });
    const input = videoBatchSchema.parse(await readJson(req));

    // Shared settings are validated once for the whole batch.
    const categoryId = await validateCategory(ctx.tenant.id, input.categoryId, ctx);
    const tagIds = await validateTags(ctx.tenant.id, input.tagIds, ctx);
    const restricted = input.visibility === Visibility.RESTRICTED;
    const accessIds = restricted
      ? await validateAccessMemberships(ctx.tenant.id, input.accessMembershipIds)
      : [];

    const failed: { input: string; reason: string }[] = [];
    const valid: { input: string; source: VideoSource; id: string }[] = [];
    for (const raw of input.items) {
      const ref = parseVideoRef(raw);
      if (!ref) {
        failed.push({ input: raw, reason: "請輸入有效的 HTTP(S) 網址或影片 ID" });
      } else {
        valid.push({ input: raw, source: ref.source, id: ref.id });
      }
    }

    // Fetch each source's title + cover concurrently.
    const metas = await Promise.all(
      valid.map((v) => resolveVideoMeta(undefined, v.source, v.id)),
    );

    let created = 0;
    for (let i = 0; i < valid.length; i++) {
      const { source, id } = valid[i];
      const { recordedOn, title } = extractDatePrefix(metas[i].rawTitle);
      try {
        await prisma.video.create({
          data: {
            tenantId: ctx.tenant.id,
            source,
            youtubeId: id,
            thumbnailUrl: metas[i].thumbnailUrl,
            title,
            recordedOn,
            visibility: input.visibility,
            categoryId,
            uploadedById: session.id,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
            access: { create: accessIds.map((membershipId) => ({ membershipId })) },
          },
        });
        created++;
      } catch {
        failed.push({ input: valid[i].input, reason: "建立失敗" });
      }
    }

    if (created > 0) {
      await recordAudit({
        tenantId: ctx.tenant.id,
        ...auditActor(session, ctx),
        action: "video.batch",
        summary: `批量上傳 ${created} 部影片`,
      });
    }

    return jsonOk({ created, failed });
  },
);

// Bulk-edit only the fields explicitly supplied by the administrator.
export const PATCH = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const input = videoBatchUpdateSchema.parse(await readJson(req));

    const owned = await prisma.video.findMany({
      where: { tenantId: ctx.tenant.id, id: { in: input.videoIds } },
      select: { id: true },
    });
    if (owned.length !== new Set(input.videoIds).size) {
      throw new ApiError(404, "選取的影片不存在或不屬於此社團");
    }

    const categoryId =
      input.categoryId === undefined
        ? undefined
        : await validateCategory(ctx.tenant.id, input.categoryId, ctx);
    const tagIds = input.tags
      ? await validateTags(ctx.tenant.id, input.tags.tagIds, ctx)
      : [];

    for (const { id } of owned) {
      await prisma.video.update({
        where: { id },
        data: {
          ...(categoryId !== undefined ? { categoryId } : {}),
          ...(input.tags?.mode === "replace"
            ? {
                tags: {
                  deleteMany: {},
                  create: tagIds.map((tagId) => ({ tagId })),
                },
              }
            : input.tags?.mode === "add"
              ? {
                  tags: {
                    connectOrCreate: tagIds.map((tagId) => ({
                      where: { videoId_tagId: { videoId: id, tagId } },
                      create: { tagId },
                    })),
                  },
                }
              : input.tags?.mode === "remove"
                ? { tags: { deleteMany: { tagId: { in: tagIds } } } }
                : {}),
        },
      });
    }

    const changes = [
      categoryId !== undefined ? "分類" : null,
      input.tags ? "標籤" : null,
    ].filter(Boolean);
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "video.batch_update",
      summary: `批量修改 ${owned.length} 部影片的${changes.join("、")}`,
    });

    return jsonOk({ updated: owned.length });
  },
);
