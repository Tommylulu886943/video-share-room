import { jsonOk, readJson, route } from "@/lib/api";
import { createNoteSchema } from "@/lib/video-notes";
import { createNote, listNotes, loadNoteVideo } from "@/lib/video-notes-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string; id: string }> };

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/** All members' timestamped notes on this video, in timeline order. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const { slug, id } = await params;
  const { video, actor } = await loadNoteVideo(slug, id);
  return jsonOk({ notes: await listNotes(video.id, actor) }, NO_STORE);
});

/** Any member who can view the video may add a note. */
export const POST = route(async (req: Request, { params }: Params) => {
  const { slug, id } = await params;
  const { video, actor } = await loadNoteVideo(slug, id);
  const input = createNoteSchema.parse(await readJson(req));
  return jsonOk({ note: await createNote(video.id, actor, input) }, { status: 201 });
});
