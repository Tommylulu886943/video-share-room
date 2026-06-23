import { pageTenantContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { getFlatCategories, buildTree, categoryLabel } from "@/lib/categories";
import { MembershipStatus } from "@/lib/constants";
import { videoPoster } from "@/lib/sources";
import { VideoManager } from "@/components/admin/VideoManager";
import { BatchUpload } from "@/components/admin/BatchUpload";

export default async function AdminVideosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });

  const flat = await getFlatCategories(ctx.tenant.id);
  const categoryTree = buildTree(flat);

  const [allTags, members, videos] = await Promise.all([
    prisma.tag.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.membership.findMany({
      where: { tenantId: ctx.tenant.id, status: MembershipStatus.APPROVED },
      orderBy: { name: "asc" },
      select: { id: true, name: true, level: true },
    }),
    prisma.video.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: "desc" },
      include: {
        tags: { include: { tag: true } },
        access: { select: { membershipId: true } },
      },
    }),
  ]);

  const videoItems = videos.map((v) => ({
    id: v.id,
    title: v.title,
    youtubeId: v.youtubeId,
    posterUrl: videoPoster(v),
    visibility: v.visibility,
    categoryId: v.categoryId,
    categoryLabel: categoryLabel(flat, v.categoryId),
    notes: v.notes,
    tags: v.tags.map((t) => t.tag.name),
    tagIds: v.tags.map((t) => t.tagId),
    accessMembershipIds: v.access.map((a) => a.membershipId),
    accessCount: v.access.length,
    recordedOn: v.recordedOn ? v.recordedOn.toISOString().slice(0, 10) : null,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">影片管理</h1>
      <BatchUpload
        slug={slug}
        categoryTree={categoryTree}
        allTags={allTags}
        members={members}
      />
      <VideoManager
        slug={slug}
        videos={videoItems}
        categoryTree={categoryTree}
        allTags={allTags}
        members={members}
      />
    </div>
  );
}
