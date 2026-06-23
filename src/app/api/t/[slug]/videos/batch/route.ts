import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/constants";
import { videoBatchSchema } from "@/lib/validation";
import { parseVideoRef, type VideoSource } from "@/lib/sources";
import {
  extractDatePrefix,
  resolveVideoMeta,
  validateAccessMemberships,
  validateCategory,
  validateTags,
} from "@/lib/videos";
import {
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
    const categoryId = await validateCategory(ctx.tenant.id, input.categoryId);
    const tagIds = await validateTags(ctx.tenant.id, input.tagIds);
    const restricted = input.visibility === Visibility.RESTRICTED;
    const accessIds = restricted
      ? await validateAccessMemberships(ctx.tenant.id, input.accessMembershipIds)
      : [];

    const failed: { input: string; reason: string }[] = [];
    const valid: { input: string; source: VideoSource; id: string }[] = [];
    for (const raw of input.items) {
      const ref = parseVideoRef(raw);
      if (!ref) {
        failed.push({ input: raw, reason: "無法辨識的 YouTube 或 Bilibili 連結" });
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
