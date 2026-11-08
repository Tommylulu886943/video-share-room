// Shared guard for the transcript API routes: tenant membership + per-video
// visibility (same rules as the video page), then YouTube-only.
import { after } from "next/server";
import { ApiError, requireTenantContext } from "@/lib/api";
import { findViewableVideo, TranscriptRequestError, type Schedule } from "@/lib/transcript-jobs";

export async function loadTranscriptVideo(slug: string, id: string) {
  const { session, ctx } = await requireTenantContext(slug);
  const video = await findViewableVideo(ctx, id);
  // Missing, other tenant, or not permitted → same 404 (don't leak existence).
  if (!video) throw new ApiError(404, "找不到影片");
  if (video.source !== "youtube") throw new ApiError(404, "此影片來源不支援逐字稿");
  return { session, ctx, video };
}

/** Run job work after the response is sent (bounded by the route's maxDuration). */
export const scheduleAfter: Schedule = (task) =>
  after(() =>
    task().catch((err) => {
      console.error("[transcript] background task failed:", err);
    }),
  );

export function mapRequestError(err: unknown): never {
  if (err instanceof TranscriptRequestError) throw new ApiError(err.status, err.message);
  throw err;
}
