import { AnnouncementManager } from "@/components/admin/AnnouncementManager";
import { prisma } from "@/lib/db";
import { pageTenantContext } from "@/lib/page";

export default async function AnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });
  const announcements = await prisma.announcement.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date().getTime();

  return (
    <AnnouncementManager
      slug={slug}
      announcements={announcements.map((item) => ({
        ...item,
        expiresAt: item.expiresAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        expired: item.expiresAt ? item.expiresAt.getTime() <= now : false,
      }))}
    />
  );
}
