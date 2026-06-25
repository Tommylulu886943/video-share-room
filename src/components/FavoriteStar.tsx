"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client";

export function FavoriteStar({
  slug,
  videoId,
  initial,
  size = "sm",
}: {
  slug: string;
  videoId: string;
  initial: boolean;
  size?: "sm" | "lg";
}) {
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    // Inside a card <Link>: don't navigate when toggling.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !fav;
    setFav(next);
    setBusy(true);
    try {
      const r = await apiPost<{ favorited: boolean }>(
        `/api/t/${slug}/videos/${videoId}/favorite`,
      );
      setFav(r.favorited);
    } catch {
      setFav(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={fav}
      aria-label={fav ? "取消收藏" : "收藏"}
      title={fav ? "取消收藏" : "收藏"}
      className={`leading-none transition active:scale-90 ${
        size === "lg" ? "text-2xl" : "text-base"
      } ${fav ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
    >
      {fav ? "★" : "☆"}
    </button>
  );
}
