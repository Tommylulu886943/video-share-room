import { jsonOk, readJson, route } from "@/lib/api";
import { updateNoteSchema } from "@/lib/video-notes";
import { deleteNote, loadNoteVideo, updateNote } from "@/lib/video-notes-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string; id: string; noteId: string }> };

/** Author only. */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const { slug, id, noteId } = await params;
  const { video, actor } = await loadNoteVideo(slug, id);
  const patch = updateNoteSchema.parse(await readJson(req));
  return jsonOk({ note: await updateNote(video.id, noteId, actor, patch) });
});

/** Author, or a tenant admin. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const { slug, id, noteId } = await params;
  const { video, actor } = await loadNoteVideo(slug, id);
  await deleteNote(video.id, noteId, actor);
  return jsonOk({ deleted: true });
});
