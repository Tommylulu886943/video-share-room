// Timestamped member notes on a video — shared types, labels and input
// validation (client-safe: no database imports).
import { z } from "zod";

export const NOTE_KINDS = ["insight", "point", "focus"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  insight: "心得",
  point: "要點",
  focus: "關注點",
};

export const NOTE_MAX_CHARS = 1000;
/** Upper bound for a timestamp (24h) — rejects garbage, not real videos. */
const MAX_MS = 24 * 3600 * 1000;

export interface NoteView {
  id: string;
  kind: NoteKind;
  /** Position on the original timeline (integer ms). */
  startMs: number;
  body: string;
  /** null when the author's account no longer exists. */
  author: { id: string; username: string } | null;
  createdAt: string;
  edited: boolean;
  /** The viewer wrote it (may edit and delete). */
  mine: boolean;
  /** Author, or a tenant admin moderating. */
  canDelete: boolean;
}

const body = z
  .string()
  .trim()
  .min(1, "筆記內容不能是空的")
  .max(NOTE_MAX_CHARS, `筆記最多 ${NOTE_MAX_CHARS} 字`);
const startMs = z.number().int().min(0).max(MAX_MS);
const kind = z.enum(NOTE_KINDS);

export const createNoteSchema = z.object({ kind: kind.default("insight"), startMs, body });
export const updateNoteSchema = z
  .object({ kind: kind.optional(), startMs: startMs.optional(), body: body.optional() })
  .refine((v) => v.kind !== undefined || v.startMs !== undefined || v.body !== undefined, "沒有要更新的內容");

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export function sortNotes<T extends { startMs: number; createdAt: string }>(notes: T[]): T[] {
  return [...notes].sort((a, b) => a.startMs - b.startMs || a.createdAt.localeCompare(b.createdAt));
}
