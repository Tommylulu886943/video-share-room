import { z } from "zod";
import { prisma } from "@/lib/db";
import { ANNOUNCEMENT_COLORS } from "@/lib/announcements";
import { ApiError, jsonOk, readJson, requireTenantContext, route } from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().min(1, "請輸入公告標題").max(100, "標題最多 100 字"),
  content: z.string().trim().min(1, "請輸入公告內容").max(2000, "內容最多 2000 字"),
  color: z.enum(ANNOUNCEMENT_COLORS),
  expiresAt: z.iso.datetime().nullable(),
});

async function ownedAnnouncement(id: string, tenantId: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement || announcement.tenantId !== tenantId) {
    throw new ApiError(404, "找不到公告");
  }
  return announcement;
}

export const PATCH = route(
  async (req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    await ownedAnnouncement(id, ctx.tenant.id);
    const input = updateSchema.parse(await readJson(req));
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new ApiError(422, "有效期限必須晚於現在");

    const announcement = await prisma.announcement.update({ where: { id }, data: { ...input, expiresAt } });
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "announcement.update",
      summary: `更新公告「${announcement.title}」`,
    });
    return jsonOk(announcement);
  },
);

export const DELETE = route(
  async (_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) => {
    const { slug, id } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const announcement = await ownedAnnouncement(id, ctx.tenant.id);
    await prisma.announcement.delete({ where: { id } });
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "announcement.delete",
      summary: `刪除公告「${announcement.title}」`,
    });
    return jsonOk({ deleted: true });
  },
);
