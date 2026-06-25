"use client";

import { useEffect } from "react";
import { apiPost } from "@/lib/client";

/**
 * Records one view when the player page mounts. Deduped per browser session
 * (sessionStorage) so refreshing the same tab doesn't keep inflating the count.
 */
export function ViewTracker({ slug, videoId }: { slug: string; videoId: string }) {
  useEffect(() => {
    const key = `viewed:${videoId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable → still count once per mount
    }
    apiPost(`/api/t/${slug}/videos/${videoId}/view`).catch(() => {});
  }, [slug, videoId]);

  return null;
}
