"use client";

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client";
import { activeSegmentIndex, formatTimestamp } from "@/lib/transcript";
import {
  NOTE_KIND_LABEL,
  NOTE_KINDS,
  NOTE_MAX_CHARS,
  sortNotes,
  type CreateNoteInput,
  type NoteKind,
  type NoteView,
  type UpdateNoteInput,
} from "@/lib/video-notes";

/** A transcript line as shown to the viewer (translation when available). */
export interface NoteLine {
  start_ms: number;
  end_ms: number;
  text: string;
}

export const NOTE_KIND_STYLE: Record<NoteKind, { chip: string; dot: string }> = {
  insight: { chip: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  point: { chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  focus: { chip: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
};

/** Load and mutate a video's notes; the list stays sorted by timestamp. */
export function useVideoNotes(slug: string, id: string) {
  const base = `/api/t/${slug}/videos/${id}/notes`;
  const [notes, setNotes] = useState<NoteView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      apiGet<{ notes: NoteView[] }>(base)
        .then((r) => {
          setNotes(r.notes);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [base],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: CreateNoteInput) => {
      const { note } = await apiPost<{ note: NoteView }>(base, input);
      setNotes((ns) => sortNotes([...(ns ?? []), note]));
      return note;
    },
    [base],
  );
  const update = useCallback(
    async (noteId: string, patch: UpdateNoteInput) => {
      const { note } = await apiPatch<{ note: NoteView }>(`${base}/${noteId}`, patch);
      setNotes((ns) => sortNotes((ns ?? []).map((n) => (n.id === note.id ? note : n))));
    },
    [base],
  );
  const remove = useCallback(
    async (noteId: string) => {
      await apiDelete(`${base}/${noteId}`);
      setNotes((ns) => (ns ?? []).filter((n) => n.id !== noteId));
    },
    [base],
  );

  return { notes, error, reload, create, update, remove };
}

export type VideoNotesApi = ReturnType<typeof useVideoNotes>;

export interface NotesPanelHandle {
  /** Start a note anchored at this moment (from a transcript line). */
  startNote: (ms: number) => void;
  /** Scroll to and briefly highlight a note. */
  showNote: (noteId: string) => void;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function lineAt(lines: NoteLine[], ms: number): NoteLine | null {
  const i = activeSegmentIndex(lines, ms);
  return i >= 0 ? lines[i] : null;
}

function KindPicker({ value, onChange }: { value: NoteKind; onChange: (k: NoteKind) => void }) {
  return (
    // Toggle buttons (aria-pressed) rather than role="radio": real radios need
    // arrow-key navigation and roving tabindex, which these buttons don't have.
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="筆記類型">
      {NOTE_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${
            value === k ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${NOTE_KIND_STYLE[k].dot}`} aria-hidden />
          {NOTE_KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

const submitKeys = (e: React.KeyboardEvent, submit: () => void) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submit();
  }
};

const NoteItem = memo(function NoteItem({
  note,
  quote,
  active,
  flash,
  onSeek,
  onUpdate,
  onRemove,
}: {
  note: NoteView;
  quote: string | null;
  active: boolean;
  flash: boolean;
  onSeek: (ms: number) => void;
  onUpdate: VideoNotesApi["update"];
  onRemove: VideoNotesApi["remove"];
}) {
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<NoteKind>(note.kind);
  const [text, setText] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setKind(note.kind);
    setText(note.body);
    setError(null);
    setEditing(true);
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(note.id, { kind, body: text });
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    const whose = note.mine ? "這則筆記" : `${note.author?.name ?? "這位使用者"} 的筆記`;
    if (!window.confirm(`確定刪除${whose}？`)) return;
    setError(null);
    try {
      await onRemove(note.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <li
      id={`note-${note.id}`}
      className={`scroll-mt-24 rounded-lg px-2 py-2 transition-colors ${
        flash ? "bg-amber-100/70" : active ? "bg-[var(--brand)]/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onSeek(note.startMs)}
          title="跳到這個時間"
          className="shrink-0 pt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--brand)] hover:underline"
        >
          {formatTimestamp(note.startMs)}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className={`chip shrink-0 px-2 py-0.5 ${NOTE_KIND_STYLE[note.kind].chip}`}>{NOTE_KIND_LABEL[note.kind]}</span>
            <span className="truncate font-medium text-slate-700">{note.author?.name ?? "已刪除的使用者"}</span>
          </div>
          {quote && <p className="mt-1 truncate text-xs text-slate-400">「{quote}」</p>}
          {editing ? (
            <div className="mt-2 space-y-2">
              <KindPicker value={kind} onChange={setKind} />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => submitKeys(e, save)}
                maxLength={NOTE_MAX_CHARS}
                rows={3}
                autoFocus
                className="input resize-y py-2"
                aria-label="編輯筆記內容"
              />
              <div className="flex gap-2">
                <button type="button" onClick={save} disabled={saving || !text.trim()} className="btn-brand px-3 py-1.5 text-xs">
                  {saving ? "儲存中…" : "儲存"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-ghost px-3 py-1.5 text-xs">
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{note.body}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                <time dateTime={note.createdAt}>{shortDate(note.createdAt)}</time>
                {note.edited && <span>· 已編輯</span>}
                {(note.mine || note.canDelete) && (
                  <span className="ml-auto flex gap-3 text-xs text-slate-500">
                    {note.mine && (
                      <button type="button" onClick={startEdit} className="py-0.5 hover:text-slate-800">
                        編輯
                      </button>
                    )}
                    {note.canDelete && (
                      <button type="button" onClick={remove} className="py-0.5 hover:text-rose-600">
                        刪除
                      </button>
                    )}
                  </span>
                )}
              </div>
            </>
          )}
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
      </div>
    </li>
  );
});

/**
 * Members' timestamped notes (心得 / 要點 / 關注點) with the author shown on
 * each. Notes anchor to a moment on the original timeline; transcript lines
 * (when present) give each note its context.
 */
export function NotesPanel({
  api,
  timeMs,
  lines,
  onSeek,
  ref,
  className = "",
}: {
  api: VideoNotesApi;
  timeMs: number | null;
  lines: NoteLine[];
  onSeek: (ms: number) => void;
  ref?: Ref<NotesPanelHandle>;
  className?: string;
}) {
  const { notes, error: loadError, reload, create, update, remove } = api;
  const [filter, setFilter] = useState<NoteKind | "all">("all");
  // null = follow the playback position until the user starts writing.
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [kind, setKind] = useState<NoteKind>("insight");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const flash = useCallback((noteId: string) => {
    setFlashId(noteId);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 2000);
    requestAnimationFrame(() =>
      document.getElementById(`note-${noteId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      startNote(ms) {
        setAnchorMs(ms);
        setFormError(null);
        requestAnimationFrame(() => {
          composerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          textareaRef.current?.focus({ preventScroll: true });
        });
      },
      showNote(noteId) {
        setFilter("all");
        flash(noteId);
      },
    }),
    [flash],
  );

  const effectiveMs = anchorMs ?? timeMs ?? 0;
  const anchorLine = lineAt(lines, effectiveMs);

  const submit = async () => {
    if (saving || !text.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const note = await create({ kind, startMs: effectiveMs, body: text });
      setText("");
      setAnchorMs(null);
      if (filter !== "all" && filter !== note.kind) setFilter("all");
      flash(note.id);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<NoteKind, number> = { insight: 0, point: 0, focus: 0 };
    for (const n of notes ?? []) c[n.kind]++;
    return c;
  }, [notes]);
  const shown = useMemo(
    () => (notes ?? []).filter((n) => filter === "all" || n.kind === filter),
    [notes, filter],
  );
  // Notes on the line being played light up as the video runs.
  const activeLine = timeMs === null || !lines.length ? -1 : activeSegmentIndex(lines, timeMs);

  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden ${className}`} aria-labelledby="video-notes-title">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2.5">
        <h2 id="video-notes-title" className="font-semibold text-slate-900">
          筆記
        </h2>
        {!!notes?.length && <span className="text-xs text-slate-400">{notes.length} 則</span>}
        {!!notes?.length && (
          <div className="ml-auto flex flex-wrap gap-1 text-xs" role="group" aria-label="篩選筆記類型">
            {(["all", ...NOTE_KINDS] as const).map((k) => {
              const n = k === "all" ? notes.length : counts[k];
              if (k !== "all" && n === 0) return null;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`rounded-full px-2.5 py-1 transition ${
                    filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {k === "all" ? "全部" : NOTE_KIND_LABEL[k]} {n}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div ref={composerRef} className="shrink-0 scroll-mt-24 space-y-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>記在</span>
          <button
            type="button"
            onClick={() => onSeek(effectiveMs)}
            className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold tabular-nums text-[var(--brand)] shadow-sm ring-1 ring-slate-200 hover:underline"
            title="跳到這個時間"
          >
            {formatTimestamp(effectiveMs)}
          </button>
          {anchorMs === null ? (
            <span>（目前播放位置）</span>
          ) : (
            timeMs !== null &&
            Math.abs(timeMs - anchorMs) >= 1000 && (
              <button type="button" onClick={() => setAnchorMs(timeMs)} className="text-[var(--brand)] hover:underline">
                改用目前時間 {formatTimestamp(timeMs)}
              </button>
            )
          )}
          {anchorLine && <span className="min-w-0 flex-1 basis-full truncate text-slate-400 sm:basis-0">「{anchorLine.text}」</span>}
        </div>
        <KindPicker value={kind} onChange={setKind} />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Freeze the moment when the user starts writing; playback may continue.
          onFocus={() => anchorMs === null && setAnchorMs(timeMs ?? 0)}
          onKeyDown={(e) => submitKeys(e, submit)}
          maxLength={NOTE_MAX_CHARS}
          rows={2}
          placeholder="寫下這一段的心得、要點或關注點…"
          className="input resize-y py-2"
          aria-label="筆記內容"
        />
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto hidden text-[11px] text-slate-400 [@media(hover:hover)]:inline">Ctrl/⌘ + Enter 送出</span>
          {(text || anchorMs !== null) && (
            <button
              type="button"
              onClick={() => {
                setText("");
                setAnchorMs(null);
                setFormError(null);
              }}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              清除
            </button>
          )}
          <button type="button" onClick={submit} disabled={saving || !text.trim()} className="btn-brand px-3 py-1.5 text-xs">
            {saving ? "儲存中…" : "新增筆記"}
          </button>
        </div>
        {formError && <p className="text-xs text-rose-600">{formError}</p>}
      </div>

      {/* Scrolls inside the panel when it has a fixed height (desktop side column). */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {notes === null && !loadError && (
          <div className="space-y-3 p-4" aria-busy="true">
            {[80, 60].map((w) => (
              <div key={w} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        {loadError && notes === null && (
          <p className="p-4 text-sm text-slate-500">
            {loadError}{" "}
            <button type="button" onClick={() => void reload()} className="text-[var(--brand)] hover:underline">
              重試
            </button>
          </p>
        )}
        {notes?.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            {lines.length
            ? "還沒有筆記。在逐字稿任一行點「＋」，或直接在上方寫下目前畫面的心得。"
            : "還沒有筆記。在上方寫下目前畫面的心得、要點或關注點。"}
          </p>
        )}
        {!!shown.length && (
          <ol className="divide-y divide-slate-100 px-2 py-1">
            {shown.map((n) => {
              const idx = lines.length ? activeSegmentIndex(lines, n.startMs) : -1;
              return (
                <NoteItem
                  key={n.id}
                  note={n}
                  quote={idx >= 0 ? lines[idx].text : null}
                  active={idx >= 0 && idx === activeLine}
                  flash={flashId === n.id}
                  onSeek={onSeek}
                  onUpdate={update}
                  onRemove={remove}
                />
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
