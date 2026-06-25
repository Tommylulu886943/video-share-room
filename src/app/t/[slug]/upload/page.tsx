import { pageTenantContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { getFlatCategories, buildTree, categoryLabel } from "@/lib/categories";
import { MembershipStatus } from "@/lib/constants";
import { videoPoster } from "@/lib/sources";
import { VideoManager } from "@/components/admin/VideoManager";
import { BatchUpload } from "@/components/admin/BatchUpload";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Admins, super admins, or members granted canUpload (others redirected).
  const { ctx } = await pageTenantContext(slug, { upload: true });

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
    thumbnailUrl: v.thumbnailUrl,
    viewCount: v.viewCount,
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
    <main className="mx-auto w-full max-w-5xl space-y-6 px-3 py-5 sm:px-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">上傳影片</h1>
        <p className="text-sm text-slate-500">
          一起維護「{ctx.tenant.name}」的影片資料庫。標題開頭可直接打日期(如 260621)。
        </p>
      </div>
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
        canManage={false}
      />
    </main>
  );
}
