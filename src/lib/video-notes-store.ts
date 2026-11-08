// Server-side persistence for timestamped video notes. Callers must already
// have checked that the viewer may see the video (see loadNoteVideo).
import { prisma } from "@/lib/db";
import { viewableVideoWhere } from "@/lib/access";
import { ApiError, requireTenantContext } from "@/lib/api";
import type { TenantContext } from "@/lib/tenant";
import type { CreateNoteInput, NoteKind, NoteView, UpdateNoteInput } from "@/lib/video-notes";

export interface NoteActor {
  userId: string;
  /** Tenant admins may delete (not edit) anyone's note. */
  isAdmin: boolean;
  /** The club the video belongs to — used to show authors by their club name. */
  tenantId: string;
}

export function noteActor(userId: string, ctx: Pick<TenantContext, "isAdmin" | "tenant">): NoteActor {
  return { userId, isAdmin: ctx.isAdmin, tenantId: ctx.tenant.id };
}

/** The video if this member may view it (same rules as the video page). */
export function findNoteVideo(ctx: TenantContext, id: string) {
  return prisma.video.findFirst({ where: { AND: [{ id }, viewableVideoWhere(ctx)] }, select: { id: true } });
}

/** Route guard: tenant member + per-video visibility. */
export async function loadNoteVideo(slug: string, id: string) {
  const { session, ctx } = await requireTenantContext(slug);
  const video = await findNoteVideo(ctx, id);
  // Missing, other tenant, or not permitted → same 404 (don't leak existence).
  if (!video) throw new ApiError(404, "找不到影片");
  return { video, actor: noteActor(session.id, ctx) };
}

// Authors are shown by their per-club display name (Membership.name), like the
// rest of the club UI — not by the global login username.
const includeFor = (tenantId: string) =>
  ({
    author: {
      select: {
        id: true,
        username: true,
        memberships: { where: { tenantId }, select: { name: true }, take: 1 },
      },
    },
  }) as const;
type Row = {
  id: string;
  kind: string;
  startMs: number;
  body: string;
  authorId: string | null;
  author: { id: string; username: string; memberships: { name: string }[] } | null;
  createdAt: Date;
  updatedAt: Date;
};

function view(row: Row, actor: NoteActor): NoteView {
  const mine = row.authorId !== null && row.authorId === actor.userId;
  return {
    id: row.id,
    kind: row.kind as NoteKind,
    startMs: row.startMs,
    body: row.body,
    author: row.author
      ? {
          id: row.author.id,
          username: row.author.username,
          name: row.author.memberships[0]?.name || row.author.username,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    edited: row.updatedAt.getTime() - row.createdAt.getTime() > 1000,
    mine,
    canDelete: mine || actor.isAdmin,
  };
}

export async function listNotes(videoId: string, actor: NoteActor): Promise<NoteView[]> {
  const rows = await prisma.videoNote.findMany({
    where: { videoId },
    include: includeFor(actor.tenantId),
    orderBy: [{ startMs: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => view(r, actor));
}

export async function createNote(videoId: string, actor: NoteActor, input: CreateNoteInput): Promise<NoteView> {
  const row = await prisma.videoNote.create({
    data: { videoId, authorId: actor.userId, kind: input.kind, startMs: input.startMs, body: input.body },
    include: includeFor(actor.tenantId),
  });
  return view(row, actor);
}

async function findOwnNote(videoId: string, noteId: string) {
  // Scoped to the video so a note id from another (maybe hidden) video 404s.
  const note = await prisma.videoNote.findFirst({ where: { id: noteId, videoId } });
  if (!note) throw new ApiError(404, "找不到筆記");
  return note;
}

export async function updateNote(
  videoId: string,
  noteId: string,
  actor: NoteActor,
  patch: UpdateNoteInput,
): Promise<NoteView> {
  const note = await findOwnNote(videoId, noteId);
  if (note.authorId !== actor.userId) throw new ApiError(403, "只能編輯自己的筆記");
  const row = await prisma.videoNote.update({
    where: { id: note.id },
    data: { kind: patch.kind, startMs: patch.startMs, body: patch.body },
    include: includeFor(actor.tenantId),
  });
  return view(row, actor);
}

export async function deleteNote(videoId: string, noteId: string, actor: NoteActor): Promise<void> {
  const note = await findOwnNote(videoId, noteId);
  if (note.authorId !== actor.userId && !actor.isAdmin) throw new ApiError(403, "只能刪除自己的筆記");
  await prisma.videoNote.delete({ where: { id: note.id } });
}
