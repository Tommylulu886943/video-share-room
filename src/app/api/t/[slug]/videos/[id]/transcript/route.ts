import { prisma } from "@/lib/db";
import { viewableVideoWhere } from "@/lib/access";
import { ApiError, jsonOk, requireTenantContext, route } from "@/lib/api";
import { getYouTubeTranscript, type TranscriptLang } from "@/lib/transcript-store";

export const runtime = "nodejs";

const LANGS: readonly TranscriptLang[] = ["orig", "zh-TW"];

export const GET = route(
  async (
    req: Request,
    { params }: { params: Promise<{ slug: string; id: string }> },
  ) => {
    const { slug, id } = await params;
    const { ctx } = await requireTenantContext(slug);
    const lang = (new URL(req.url).searchParams.get("lang") ?? "orig") as TranscriptLang;
    if (!LANGS.includes(lang)) throw new ApiError(400, "不支援的語言");

    const video = await prisma.video.findFirst({
      where: { AND: [{ id }, viewableVideoWhere(ctx)] },
      select: { source: true, youtubeId: true },
    });
    if (!video) throw new ApiError(404, "找不到影片");
    if (video.source !== "youtube") throw new ApiError(404, "此影片來源不支援逐字稿");

    try {
      const data = await getYouTubeTranscript(video.youtubeId, lang);
      return jsonOk(data, { headers: { "Cache-Control": "private, max-age=3600" } });
    } catch (err) {
      console.error("[transcript] fetch failed:", video.youtubeId, lang, err);
      throw new ApiError(502, lang === "orig" ? "暫時無法取得字幕" : "翻譯暫時無法使用");
    }
  },
);
