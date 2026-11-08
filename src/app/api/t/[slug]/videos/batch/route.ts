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
    const seen = new Set<string>();
    for (const raw of input.items) {
      const ref = parseVideoRef(raw);
      if (!ref) {
        failed.push({ input: raw, reason: "請輸入有效的 HTTP(S) 網址或影片 ID" });
        continue;
      }
      // The same link pasted twice must not become two rows.
      const key = `${ref.source}:${ref.id}`;
      if (seen.has(key)) {
        failed.push({ input: raw, reason: "重複的連結（已略過）" });
        continue;
      }
      seen.add(key);
      valid.push({ input: raw, source: ref.source, id: ref.id });
    }

    // Skip videos this club already has (there is no unique index on
    // (tenantId, youtubeId), so re-importing would duplicate silently).
    if (valid.length > 0) {
      const existing = await prisma.video.findMany({
        where: {
          tenantId: ctx.tenant.id,
          OR: valid.map((v) => ({ source: v.source, youtubeId: v.id })),
        },
        select: { source: true, youtubeId: true },
      });
      const have = new Set(existing.map((e) => `${e.source}:${e.youtubeId}`));
      for (let i = valid.length - 1; i >= 0; i--) {
        const v = valid[i];
        if (have.has(`${v.source}:${v.id}`)) {
          failed.push({ input: v.input, reason: "此影片已在社團中（已略過）" });
          valid.splice(i, 1);
        }
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

    const videoIds = owned.map((v) => v.id);

    // Set-based writes instead of one round-trip per video: 500 sequential
    // updates over Turso's HTTP driver blew past the function timeout and left
    // the batch half-applied. (No createMany: it fails on libSQL inside a
    // transaction; nested relation writes are used for the inserts.)
    if (categoryId !== undefined) {
      await prisma.video.updateMany({
        where: { id: { in: videoIds } },
        data: { categoryId },
      });
    }
    if (input.tags?.mode === "remove") {
      await prisma.videoTag.deleteMany({
        where: { videoId: { in: videoIds }, tagId: { in: tagIds } },
      });
    } else if (input.tags?.mode === "replace") {
      await prisma.videoTag.deleteMany({ where: { videoId: { in: videoIds } } });
    }
    if ((input.tags?.mode === "replace" || input.tags?.mode === "add") && tagIds.length > 0) {
      // Only rows that are missing are inserted, so "add" is idempotent and
      // "replace" (after the delete above) inserts the full set.
      const present = await prisma.videoTag.findMany({
        where: { videoId: { in: videoIds }, tagId: { in: tagIds } },
        select: { videoId: true, tagId: true },
      });
      const has = new Set(present.map((p) => `${p.videoId}:${p.tagId}`));
      const writes = videoIds.flatMap((videoId) => {
        const missing = tagIds.filter((tagId) => !has.has(`${videoId}:${tagId}`));
        return missing.length
          ? [{ videoId, create: missing.map((tagId) => ({ tagId })) }]
          : [];
      });
      const CHUNK = 20;
      for (let i = 0; i < writes.length; i += CHUNK) {
        await Promise.all(
          writes.slice(i, i + CHUNK).map((w) =>
            prisma.video.update({ where: { id: w.videoId }, data: { tags: { create: w.create } } }),
          ),
        );
      }
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
