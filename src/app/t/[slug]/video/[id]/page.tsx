import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageTenantContext } from "@/lib/page";
import { canViewVideo } from "@/lib/access";
import { VideoEmbed } from "@/components/VideoEmbed";
import { videoPoster, videoWatchUrl, SOURCE_LABEL, type VideoSource } from "@/lib/sources";
import { Visibility } from "@/lib/constants";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { ctx } = await pageTenantContext(slug);

  const video = await prisma.video.findUnique({
    where: { id },
    include: {
      category: { include: { parent: true } },
      tags: { include: { tag: true } },
      access: { select: { membershipId: true } },
      uploadedBy: { select: { username: true } },
    },
  });

  // Wrong tenant, missing, or not permitted → 404 (don't leak existence).
  if (!video || video.tenantId !== ctx.tenant.id || !canViewVideo(ctx, video)) {
    notFound();
  }

  const categoryLabel = video.category
    ? video.category.parent
      ? `${video.category.parent.name} / ${video.category.name}`
      : video.category.name
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5">
      <Link
        href={`/t/${slug}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        ← 返回影片牆
      </Link>

      <div className="overflow-hidden rounded-xl bg-black shadow-sm">
        <div className="relative aspect-video">
          <VideoEmbed
            source={video.source}
            videoId={video.youtubeId}
            title={video.title}
            posterUrl={videoPoster(video)}
          />
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-sm font-semibold text-[var(--brand)]">
          {(video.recordedOn ?? video.createdAt)
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, "/")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">{video.title}</h1>
          {video.visibility === Visibility.RESTRICTED && (
            <span className="chip bg-amber-100 text-amber-700">🔒 受限影片</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {categoryLabel && (
            <span className="chip bg-[var(--brand)]/10 text-[var(--brand)]">
              {categoryLabel}
            </span>
          )}
          {video.tags.map((t) => (
            <span key={t.tagId} className="chip bg-slate-100 text-slate-600">
              #{t.tag.name}
            </span>
          ))}
        </div>

        {video.notes && (
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {video.notes}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <a
            href={videoWatchUrl(video.source, video.youtubeId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 underline hover:text-slate-800"
          >
            在 {SOURCE_LABEL[video.source as VideoSource] ?? video.source} 開啟
          </a>
          {ctx.isAdmin && (
            <Link
              href={`/t/${slug}/admin/videos`}
              className="text-[var(--brand)] hover:underline"
            >
              管理影片與權限
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
