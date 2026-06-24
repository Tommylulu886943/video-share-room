"use client";

import { useRef, useState } from "react";
import {
  supportsHoverPreview,
  videoPreviewEmbed,
  sourceGradient,
} from "@/lib/sources";

/**
 * The card's media area. On desktop hover it swaps the poster for a muted
 * autoplay preview (YouTube only); a transparent overlay keeps the click going
 * to the parent <Link> (opens the full player) and stops the iframe stealing it.
 */
export function CardMedia({
  source,
  videoId,
  posterUrl,
  sourceLabel,
  restricted,
}: {
  source: string;
  videoId: string;
  posterUrl: string | null;
  sourceLabel: string;
  restricted: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canPreview = supportsHoverPreview(source);

  function enter() {
    if (!canPreview) return;
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(hover: hover)").matches
    ) {
      return; // touch devices: tap opens the full page instead
    }
    timer.current = setTimeout(() => setPreview(true), 350);
  }
  function leave() {
    if (timer.current) clearTimeout(timer.current);
    setPreview(false);
  }

  return (
    <div
      className="relative aspect-video overflow-hidden bg-slate-100"
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {preview ? (
        <iframe
          src={videoPreviewEmbed(source, videoId)}
          title={sourceLabel}
          tabIndex={-1}
          allow="autoplay; encrypted-media"
          className="absolute inset-0 h-full w-full"
        />
      ) : posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      ) : (
        <div
          className={`grid h-full w-full place-items-center text-sm font-semibold text-white/90 ${sourceGradient(source)}`}
        >
          {sourceLabel}
        </div>
      )}

      {/* Transparent click layer: clicks bubble to the parent Link → open full page. */}
      <div className="absolute inset-0 z-10" />

      {!preview && (
        <span className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white opacity-90 transition group-hover:scale-110">
            ▶
          </span>
        </span>
      )}
      <span className="chip pointer-events-none absolute right-2 top-2 z-20 bg-black/60 text-[10px] text-white">
        {sourceLabel}
      </span>
      {restricted && (
        <span className="chip pointer-events-none absolute left-2 top-2 z-20 bg-black/70 text-white">
          🔒 受限
        </span>
      )}
    </div>
  );
}
