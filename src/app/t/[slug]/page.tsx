import { BoardFilters } from "@/components/BoardFilters";
import { VideoCard, type VideoCardData } from "@/components/VideoCard";
import { prisma } from "@/lib/db";
import { pageTenantContext } from "@/lib/page";
import { viewableVideoWhere } from "@/lib/access";
import { videoPoster } from "@/lib/sources";
import {
  buildTree,
  categoryIdsForFilter,
  categoryLabel,
  getFlatCategories,
} from "@/lib/categories";
import type { Prisma } from "@/generated/prisma/client";

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    cat?: string;
    tag?: string | string[];
    q?: string;
    sort?: string;
    fav?: string;
  }>;
}) {
  const { slug } = await params;
  const { session, ctx } = await pageTenantContext(slug);
  const sp = await searchParams;
  const favOnly = (Array.isArray(sp.fav) ? sp.fav[0] : sp.fav) === "1";

  const tagIds = asArray(sp.tag);
  const q = (sp.q ?? "").trim();

  const [flatCategories, tags] = await Promise.all([
    getFlatCategories(ctx.tenant.id),
    prisma.tag.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  // Category selection: no `cat` param → the tenant's default category;
  // `cat=all` → show everything; otherwise the given id. Fall back to "all"
  // if the resolved id no longer points to a live category.
  const rawCat = Array.isArray(sp.cat) ? sp.cat[0] : sp.cat;
  let catId =
    rawCat === undefined
      ? (ctx.tenant.defaultCategoryId ?? "")
      : rawCat === "all"
        ? ""
        : rawCat;
  if (catId && !flatCategories.some((c) => c.id === catId)) catId = "";

  // Compose the where clause: access gate + category + tags + keyword.
  const filters: Prisma.VideoWhereInput[] = [viewableVideoWhere(ctx)];

  if (catId) {
    filters.push({ categoryId: { in: categoryIdsForFilter(flatCategories, catId) } });
  }
  for (const tagId of tagIds) {
    filters.push({ tags: { some: { tagId } } });
  }
  if (q) {
    filters.push({
      OR: [{ title: { contains: q } }, { notes: { contains: q } }],
    });
  }
  if (favOnly) {
    filters.push({ favorites: { some: { userId: session.id } } });
  }

  const sort = (Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) ?? "new";
  const orderBy: Prisma.VideoOrderByWithRelationInput[] =
    sort === "views"
      ? [{ viewCount: "desc" }, { createdAt: "desc" }]
      : sort === "date_asc"
        ? [{ recordedOn: "asc" }, { createdAt: "asc" }]
        : sort === "date_desc"
          ? [{ recordedOn: "desc" }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }];

  const videos = await prisma.video.findMany({
    where: { AND: filters },
    orderBy,
    include: {
      tags: { include: { tag: true } },
      favorites: { where: { userId: session.id }, select: { userId: true } },
    },
  });

  const cards: VideoCardData[] = videos.map((v) => ({
    id: v.id,
    title: v.title,
    source: v.source,
    posterUrl: videoPoster(v),
    viewCount: v.viewCount,
    favorited: v.favorites.length > 0,
    visibility: v.visibility,
    categoryLabel: categoryLabel(flatCategories, v.categoryId),
    tags: v.tags.map((t) => t.tag.name),
    // Show the recorded date if known, otherwise fall back to the upload date.
    recordedOn: (v.recordedOn ?? v.createdAt)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "/"),
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5">
      <p className="mb-3 text-sm text-slate-500">
        {videos.length} 支影片{ctx.isAdmin ? "（管理者可見全部）" : ""}
      </p>

      <div className="card mb-5 p-4">
        <BoardFilters
          basePath={`/t/${slug}`}
          categories={buildTree(flatCategories)}
          tags={tags}
          selected={{ catId, tagIds, q, sort, favOnly }}
        />
      </div>

      {cards.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <span className="mb-2 text-4xl">🎞️</span>
          <p className="font-medium text-slate-700">沒有符合條件的影片</p>
          <p className="text-sm text-slate-500">試試調整篩選條件或搜尋關鍵字。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((v) => (
            <VideoCard key={v.id} video={v} slug={slug} />
          ))}
        </div>
      )}
    </main>
  );
}
