"use client";

import { useState } from "react";
import { youtubeEmbed, youtubeThumb, youtubeThumbMax } from "@/lib/youtube";

/**
 * Lightweight YouTube facade: paints a thumbnail + play button instantly and
 * only injects the heavy (~hundreds of KB) YouTube iframe after the user
 * clicks play. Massively cuts the work of "entering a video".
 */
export function YouTubePlayer({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [thumb, setThumb] = useState(youtubeThumbMax(id));

  if (playing) {
    return (
      <iframe
        src={`${youtubeEmbed(id)}&autoplay=1`}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb}
        alt={title}
        // maxresdefault is missing for some videos → fall back to hqdefault.
        onError={() => setThumb(youtubeThumb(id))}
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/30">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-2xl text-white shadow-lg transition group-hover:scale-110">
          ▶
        </span>
      </span>
    </button>
  );
}
