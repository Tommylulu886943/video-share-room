import { z } from "zod";
import { prisma } from "@/lib/db";
import { ANNOUNCEMENT_COLORS } from "@/lib/announcements";
import { ApiError, jsonOk, readJson, requireTenantContext, route } from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const announcementSchema = z.object({
  title: z.string().trim().min(1, "請輸入公告標題").max(100, "標題最多 100 字"),
  content: z.string().trim().min(1, "請輸入公告內容").max(2000, "內容最多 2000 字"),
  color: z.enum(ANNOUNCEMENT_COLORS),
  expiresAt: z.iso.datetime().nullable(),
});

export const POST = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const input = announcementSchema.parse(await readJson(req));
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new ApiError(422, "有效期限必須晚於現在");
    }

    const announcement = await prisma.announcement.create({
      data: { ...input, expiresAt, tenantId: ctx.tenant.id },
    });
    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: "announcement.create",
      summary: `新增公告「${announcement.title}」`,
    });
    return jsonOk(announcement, { status: 201 });
  },
);
