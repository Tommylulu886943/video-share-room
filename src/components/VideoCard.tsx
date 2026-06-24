import Link from "next/link";
import { Visibility } from "@/lib/constants";
import { SOURCE_LABEL, sourceGradient, type VideoSource } from "@/lib/sources";

export interface VideoCardData {
  id: string;
  title: string;
  source: string;
  posterUrl: string | null;
  visibility: string;
  categoryLabel: string | null;
  tags: string[];
  recordedOn: string | null;
}

export function VideoCard({
  video,
  slug,
}: {
  video: VideoCardData;
  slug: string;
}) {
  const sourceLabel = SOURCE_LABEL[video.source as VideoSource] ?? video.source;
  return (
    <Link
      href={`/t/${slug}/video/${video.id}`}
      className="card group overflow-hidden transition hover:shadow-md"
    >
      <div className="relative aspect-video overflow-hidden bg-slate-100">
        {video.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.posterUrl}
            alt={video.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div
            className={`grid h-full w-full place-items-center text-sm font-semibold text-white/90 ${sourceGradient(video.source)}`}
          >
            {sourceLabel}
          </div>
        )}
        <span className="chip absolute right-2 top-2 bg-black/60 text-[10px] text-white">
          {sourceLabel}
        </span>
        {video.visibility === Visibility.RESTRICTED && (
          <span className="chip absolute left-2 top-2 bg-black/70 text-white">
            🔒 受限
          </span>
        )}
      </div>
      <div className="p-3">
        {video.recordedOn && (
          <p className="mb-0.5 text-xs font-semibold text-[var(--brand)]">
            {video.recordedOn}
          </p>
        )}
        <h3 className="line-clamp-2 font-semibold text-slate-900">
          {video.title}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {video.categoryLabel && (
            <span className="chip bg-[var(--brand)]/10 text-[var(--brand)]">
              {video.categoryLabel}
            </span>
          )}
          {video.tags.slice(0, 3).map((t) => (
            <span key={t} className="chip bg-slate-100 text-slate-600">
              #{t}
            </span>
          ))}
          {video.tags.length > 3 && (
            <span className="text-slate-400">+{video.tags.length - 3}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
