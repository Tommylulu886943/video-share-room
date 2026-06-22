import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/constants";
import { videoBatchSchema, parseYouTubeId } from "@/lib/validation";
import {
  extractDatePrefix,
  fetchYouTubeTitle,
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
    const valid: { input: string; youtubeId: string }[] = [];
    for (const raw of input.items) {
      const youtubeId = parseYouTubeId(raw);
      if (!youtubeId) {
        failed.push({ input: raw, reason: "無法辨識的 YouTube 連結或 ID" });
      } else {
        valid.push({ input: raw, youtubeId });
      }
    }

    // Fetch YouTube titles concurrently (blank → falls back to placeholder).
    const titles = await Promise.all(
      valid.map((v) => fetchYouTubeTitle(v.youtubeId)),
    );

    let created = 0;
    for (let i = 0; i < valid.length; i++) {
      const { youtubeId } = valid[i];
      const { recordedOn, title } = extractDatePrefix(
        titles[i] ?? "未命名影片",
      );
      try {
        await prisma.video.create({
          data: {
            tenantId: ctx.tenant.id,
            youtubeId,
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
