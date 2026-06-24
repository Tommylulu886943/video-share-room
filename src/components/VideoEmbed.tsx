"use client";

import { useState } from "react";
import {
  videoEmbed,
  sourceGradient,
  SOURCE_LABEL,
  type VideoSource,
} from "@/lib/sources";

/**
 * Click-to-load facade for any supported source (YouTube / Bilibili): paints the
 * poster instantly and only injects the heavy player iframe on play.
 */
export function VideoEmbed({
  source,
  videoId,
  title,
  posterUrl,
}: {
  source: string;
  videoId: string;
  title: string;
  posterUrl: string | null;
}) {
  // Instagram has no usable poster, and its own embed shows the cover + play —
  // so load it directly (one click on IG's player) instead of our facade.
  const [playing, setPlaying] = useState(source === "instagram");
  const [broken, setBroken] = useState(false);
  const label = SOURCE_LABEL[source as VideoSource] ?? source;

  if (playing) {
    return (
      <iframe
        src={videoEmbed(source, videoId, true)}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group absolute inset-0 h-full w-full cursor-pointer"
      aria-label={`播放 ${title}`}
    >
      {posterUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt={title}
          onError={() => setBroken(true)}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={`grid h-full w-full place-items-center font-semibold text-white/90 ${sourceGradient(source)}`}
        >
          {label}
        </div>
      )}
      <span className="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/30">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-2xl text-white shadow-lg transition group-hover:scale-110">
          ▶
        </span>
      </span>
    </button>
  );
}
