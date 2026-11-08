import { z } from "zod";
import { ApiError, jsonOk, readJson, route } from "@/lib/api";
import { getTranscriptState, requestTranscript } from "@/lib/transcript-jobs";
import { loadTranscriptVideo, mapRequestError, scheduleAfter } from "@/lib/transcript-api";

export const runtime = "nodejs";
// Background work scheduled with after() shares this budget.
export const maxDuration = 300;

type Params = { params: Promise<{ slug: string; id: string }> };

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/** Current original transcript, translations, latest job status and errors. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const { slug, id } = await params;
  const { video } = await loadTranscriptVideo(slug, id);
  return jsonOk(await getTranscriptState(video, scheduleAfter), NO_STORE);
});

const Body = z.object({
  language: z.string().max(20).nullish(),
  force: z.boolean().optional(),
  translateTo: z.string().max(20).nullish(),
});

/** Get (or refresh) the original transcript; optionally translate once it exists. */
export const POST = route(async (req: Request, { params }: Params) => {
  const { slug, id } = await params;
  const { session, ctx, video } = await loadTranscriptVideo(slug, id);
  const body = Body.parse(await readJson(req));
  if (body.force && !ctx.canUpload) throw new ApiError(403, "只有可上傳影片的成員能重新取得逐字稿");
  await requestTranscript(
    video,
    {
      language: body.language ?? null,
      force: body.force,
      translateTo: body.translateTo ?? null,
      userId: session.id,
      canRefetch: ctx.canUpload,
    },
    scheduleAfter,
  ).catch(mapRequestError);
  return jsonOk(await getTranscriptState(video), NO_STORE);
});
