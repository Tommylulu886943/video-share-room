import { z } from "zod";
import { ApiError, jsonOk, readJson, route } from "@/lib/api";
import { getTranscriptState, requestTranslation } from "@/lib/transcript-jobs";
import { loadTranscriptVideo, mapRequestError, scheduleAfter } from "@/lib/transcript-api";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ slug: string; id: string }> };

const Body = z.object({
  transcriptVersion: z.number().int().positive(),
  targetLanguage: z.string().max(20).optional(),
  force: z.boolean().optional(),
});

/** Translate one specific original version (reuses an existing translation unless forced). */
export const POST = route(async (req: Request, { params }: Params) => {
  const { slug, id } = await params;
  const { session, ctx, video } = await loadTranscriptVideo(slug, id);
  const body = Body.parse(await readJson(req));
  if (body.force && !ctx.canUpload) throw new ApiError(403, "只有可上傳影片的成員能重新翻譯");
  await requestTranslation(
    video,
    { transcriptVersion: body.transcriptVersion, targetLanguage: body.targetLanguage, force: body.force, userId: session.id },
    scheduleAfter,
  ).catch(mapRequestError);
  return jsonOk(await getTranscriptState(video), { headers: { "Cache-Control": "no-store" } });
});
