"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import {
  activeSegmentIndex,
  formatTimestamp,
  TRANSLATE_TARGET,
  type TranscriptSegment,
} from "@/lib/transcript";
import type { JobView, TranscriptState } from "@/lib/transcript-jobs";
import type { NoteKind } from "@/lib/video-notes";
import { NOTE_KIND_STYLE, type NoteLine } from "@/components/VideoNotes";

/** What the transcript needs to know about a note to mark its line. */
export interface NoteRef {
  id: string;
  startMs: number;
  kind: NoteKind;
}

/** Pause auto-follow this long after the user scrolls the list themselves. */
const USER_SCROLL_PAUSE_MS = 5000;
const POLL_MS = 2000;

const SOURCE_LABEL: Record<string, string> = {
  youtube_manual: "YouTube 字幕",
  youtube_auto: "YouTube 自動字幕",
  asr: "語音辨識",
};

const COMMON_LANGS: [string, string][] = [
  ["ja", "日文"],
  ["en", "英文"],
  ["zh-TW", "中文（繁體）"],
  ["zh-CN", "中文（簡體）"],
  ["ko", "韓文"],
];

const isActive = (s: string) => s === "queued" || s === "processing";

const Line = memo(function Line({
  seg,
  translated,
  showTranslation,
  active,
  notes,
  lang,
  onSeek,
  onAddNote,
  onShowNote,
}: {
  seg: TranscriptSegment;
  translated: string | undefined;
  showTranslation: boolean;
  active: boolean;
  notes: NoteRef[] | undefined;
  /** BCP-47 tag of the original text. */
  lang: string | undefined;
  onSeek: (ms: number) => void;
  onAddNote?: (ms: number) => void;
  onShowNote?: (noteId: string) => void;
}) {
  const main = showTranslation && translated ? translated : seg.text;
  const mainLang = showTranslation && translated ? "zh-Hant-TW" : lang;
  const kinds = notes ? [...new Set(notes.map((n) => n.kind))] : [];
  return (
    <li
      data-active={active || undefined}
      aria-current={active ? "true" : undefined}
      className={`group flex items-start rounded-lg transition ${
        active ? "bg-[var(--brand)]/10 text-slate-900" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <button
        type="button"
        onClick={() => onSeek(seg.start_ms)}
        className="flex min-w-0 flex-1 gap-3 px-2 py-1.5 text-left text-sm"
      >
        <span
          className={`shrink-0 pt-px font-mono text-xs tabular-nums ${
            active ? "font-semibold text-[var(--brand)]" : "text-slate-400"
          }`}
        >
          {formatTimestamp(seg.start_ms)}
        </span>
        <span className="min-w-0">
          {/* lang: Han-unified glyphs render with the right regional font variants. */}
          <span lang={mainLang} className={active ? "font-medium" : undefined}>{main}</span>
          {showTranslation && translated && translated !== seg.text && (
            <span lang={lang} className="mt-0.5 block text-xs text-slate-400">{seg.text}</span>
          )}
        </span>
      </button>
      {(notes?.length || onAddNote) && (
        <span className="flex shrink-0 items-center gap-0.5 py-1 pr-1">
          {notes?.length && onShowNote ? (
            <button
              type="button"
              onClick={() => onShowNote(notes[0].id)}
              title={`查看 ${notes.length} 則筆記`}
              aria-label={`${formatTimestamp(seg.start_ms)} 有 ${notes.length} 則筆記`}
              className="flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-white hover:text-slate-800"
            >
              {kinds.map((k) => (
                <span key={k} className={`h-1.5 w-1.5 rounded-full ${NOTE_KIND_STYLE[k].dot}`} aria-hidden />
              ))}
              <span className="ml-0.5 tabular-nums">{notes.length}</span>
            </button>
          ) : null}
          {onAddNote && (
            <button
              type="button"
              onClick={() => onAddNote(seg.start_ms)}
              title="在這一段新增筆記"
              aria-label={`在 ${formatTimestamp(seg.start_ms)} 新增筆記`}
              className="rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-white hover:text-[var(--brand)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
          )}
        </span>
      )}
    </li>
  );
});

function StatusRow({
  label,
  tone,
  text,
  children,
}: {
  label: string;
  tone: "idle" | "busy" | "ok" | "warn" | "error";
  text: string;
  children?: React.ReactNode;
}) {
  const dot = {
    idle: "bg-slate-300",
    busy: "animate-pulse bg-[var(--brand)]",
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    error: "bg-rose-500",
  }[tone];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="font-medium text-slate-700">{label}</span>
      <span className={`min-w-0 ${tone === "error" ? "text-rose-600" : tone === "warn" ? "text-amber-700" : "text-slate-500"}`}>
        {text}
      </span>
      {children && <span className="ml-auto flex gap-2">{children}</span>}
    </div>
  );
}

function LinkButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-[var(--brand)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function jobText(job: JobView | null, busyText: string): string {
  if (!job) return "";
  if (job.status === "queued") return job.errorMessage ? `等待重試（${job.errorMessage}）` : "排隊中…";
  if (job.status === "processing") {
    return job.progress ? `${busyText} ${job.progress.done}/${job.progress.total}` : `${busyText}`;
  }
  return job.errorMessage ?? "";
}

export function TranscriptPanel({
  slug,
  id,
  timeMs,
  onSeek,
  canForce,
  notes,
  onAddNote,
  onShowNote,
  onLinesChange,
  className = "",
}: {
  slug: string;
  id: string;
  timeMs: number | null;
  onSeek: (ms: number) => void;
  /** Uploaders/admins may force a re-fetch / re-translation of existing results. */
  canForce: boolean;
  /** Members' notes, marked on the line whose time range holds them. */
  notes?: NoteRef[] | null;
  onAddNote?: (ms: number) => void;
  onShowNote?: (noteId: string) => void;
  /** Reports the lines as displayed, so notes can quote them. */
  onLinesChange?: (lines: NoteLine[]) => void;
  className?: string;
}) {
  const base = `/api/t/${slug}/videos/${id}/transcript`;
  const [state, setState] = useState<TranscriptState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [language, setLanguage] = useState("");
  const [view, setView] = useState<"orig" | "zh" | null>(null);
  // A failed refresh is feedback for whoever asked for it in this page view;
  // after a reload the saved version is simply shown as completed.
  const [watchJobId, setWatchJobId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const userScrollAt = useRef(0);

  const refresh = useCallback(
    () =>
      apiGet<TranscriptState>(base)
        .then((s) => {
          setState(s);
          setLoadError(null);
        })
        .catch((e: Error) => setLoadError(e.message)),
    [base],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while either job is running. `tick` advances after every attempt —
  // including a failed one — so one dropped request doesn't stop polling and
  // leave the panel saying "翻譯中…" forever.
  const running = !!state && (isActive(state.transcriptStatus) || isActive(state.translationStatus));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      refresh().finally(() => setTick((n) => n + 1));
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [running, tick, refresh]);

  const post = async (url: string, body: unknown): Promise<TranscriptState | null> => {
    setPosting(true);
    setActionError(null);
    try {
      const next = await apiPost<TranscriptState>(url, body);
      setState(next);
      return next;
    } catch (e) {
      setActionError((e as Error).message);
      return null;
    } finally {
      setPosting(false);
    }
  };

  const transcript = state?.transcript ?? null;
  const translation = state?.translation ?? null;
  const canTranslate = !!state?.llmConfigured && !!state?.translationNeeded;

  const fetchTranscript = async (opts: { force?: boolean; translate?: boolean }) => {
    if (
      opts.force &&
      !window.confirm("重新向 YouTube 取得原文？內容若有變動會建立新版本，翻譯也需要重新產生（會使用 AI 額度）。")
    ) {
      return;
    }
    const next = await post(base, {
      language: language || null,
      force: opts.force ?? false,
      translateTo: opts.translate && state?.llmConfigured ? TRANSLATE_TARGET : null,
    });
    if (next?.transcriptJob) setWatchJobId(next.transcriptJob.id);
  };
  const translate = async (force = false) => {
    if (!transcript) return;
    if (force && !window.confirm("已有儲存的翻譯。重新翻譯會再次使用 AI 額度，確定嗎？")) return;
    const next = await post(`${base}/translation`, { transcriptVersion: transcript.version, targetLanguage: TRANSLATE_TARGET, force });
    if (next?.translationJob) setWatchJobId(next.translationJob.id);
  };

  const translatedById = useMemo(
    () => new Map((translation?.segments ?? []).map((s) => [s.id, s.text])),
    [translation],
  );
  const showTranslation = (view ?? (translation ? "zh" : "orig")) === "zh" && !!translation;
  const segments = useMemo(() => transcript?.segments ?? [], [transcript]);
  const active = timeMs === null ? -1 : activeSegmentIndex(segments, timeMs);

  // Notes by line: a note belongs to the line playing at its timestamp (notes
  // before the first line go on the first one).
  const notesByLine = useMemo(() => {
    const map = new Map<number, NoteRef[]>();
    if (!segments.length) return map;
    for (const n of notes ?? []) {
      const i = Math.max(0, activeSegmentIndex(segments, n.startMs));
      const list = map.get(i);
      if (list) list.push(n);
      else map.set(i, [n]);
    }
    return map;
  }, [notes, segments]);

  useEffect(() => {
    onLinesChange?.(
      segments.map((s) => ({ start_ms: s.start_ms, end_ms: s.end_ms, text: translatedById.get(s.id) ?? s.text })),
    );
  }, [segments, translatedById, onLinesChange]);

  // Keep the active line in view (inside the panel only — never scroll the page).
  useEffect(() => {
    const list = listRef.current;
    if (!list || active < 0) return;
    if (Date.now() - userScrollAt.current < USER_SCROLL_PAUSE_MS) return;
    const el = list.querySelector<HTMLElement>("[data-active]");
    if (!el) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) {
      // Smooth scrolling fires scroll events for a while; ignore them as "user" scrolls.
      programmaticScrollUntil.current = Date.now() + 800;
      list.scrollTo({ top: Math.max(0, top - list.clientHeight / 3), behavior: "smooth" });
    }
  }, [active, showTranslation]);

  // Any scroll the panel didn't start itself (wheel, touch, scrollbar drag,
  // keyboard) pauses auto-follow; programmatic scrolls are flagged so they
  // don't count as the user's.
  const programmaticScrollUntil = useRef(0);
  const markUserScroll = () => {
    if (Date.now() < programmaticScrollUntil.current) return;
    userScrollAt.current = Date.now();
  };

  // Only the caption languages this video actually has; the generic list is a
  // fallback before YouTube has been asked (e.g. to steer speech recognition).
  const available = useMemo(() => state?.availableLanguages ?? [], [state?.availableLanguages]);
  const langOptions = useMemo<[string, string][]>(
    () =>
      available.length
        ? available.map((o) => [o.code, `${o.label}${o.kinds.includes("manual") ? "" : "（自動字幕）"}`])
        : COMMON_LANGS,
    [available],
  );

  const languagePicker = (
    <label className="flex items-center gap-1.5 text-xs text-slate-500">
      影片原文語言
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700"
      >
        <option value="">自動判定</option>
        {langOptions.map(([code, label]) => (
          <option key={code} value={code}>
            {label} ({code})
          </option>
        ))}
      </select>
    </label>
  );

  // ---- status rows ----
  const tStatus = state?.transcriptStatus ?? "not_requested";
  const tJob = state?.transcriptJob ?? null;
  const xStatus = state?.translationStatus ?? "not_requested";
  const xJob = state?.translationJob ?? null;
  const busy = posting || isActive(tStatus);

  let tTone: "idle" | "busy" | "ok" | "warn" | "error" = "idle";
  let tText = "尚未取得";
  if (isActive(tStatus)) {
    tTone = "busy";
    tText = jobText(tJob, "取得中…");
  } else if (tStatus === "failed" && (!transcript || tJob?.id === watchJobId)) {
    // A failed refresh doesn't break anything: the last good version stays.
    tTone = transcript ? "warn" : "error";
    tText = transcript
      ? `重新取得失敗：${tJob?.errorMessage ?? "未知錯誤"}（目前顯示第 ${transcript.version} 版）`
      : (tJob?.errorMessage ?? "取得失敗");
  } else if (transcript) {
    tTone = "ok";
    tText = `${SOURCE_LABEL[transcript.source] ?? transcript.source} · ${transcript.language} · 第 ${transcript.version} 版`;
  }

  let xTone: "idle" | "busy" | "ok" | "warn" | "error" = "idle";
  let xText = "等待原文";
  if (!state?.translationNeeded) {
    xTone = "ok";
    xText = "原文已是繁體中文，不需翻譯";
  } else if (!state.llmConfigured) {
    xTone = "warn";
    xText = "翻譯服務未設定，請聯繫管理者";
  } else if (isActive(xStatus)) {
    xTone = "busy";
    xText = jobText(xJob, "翻譯中…");
  } else if (xStatus === "failed" && !translation) {
    xTone = "error";
    xText = xJob?.errorMessage ?? "翻譯失敗";
  } else if (xStatus === "failed" && translation && xJob?.id === watchJobId) {
    // A failed *re*-translation is feedback for whoever asked; everyone else
    // just sees the stored translation (same rule as the transcript row).
    xTone = "warn";
    xText = `重新翻譯失敗：${xJob?.errorMessage ?? "未知錯誤"}（目前顯示既有翻譯）`;
  } else if (translation) {
    xTone = "ok";
    xText = `已完成（對應第 ${translation.transcriptVersion} 版原文）`;
  } else if (transcript) {
    xText = "尚未翻譯";
  }

  const ambiguous =
    tStatus === "failed" && tJob?.errorCode === "language_ambiguous" && (!transcript || tJob.id === watchJobId);

  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden ${className} ${transcript ? "" : "max-lg:h-auto"}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <h2 className="font-semibold text-slate-900">逐字稿</h2>
        {transcript?.source === "youtube_auto" && <span className="chip bg-slate-100 text-slate-500">自動字幕</span>}
        {transcript?.source === "asr" && <span className="chip bg-slate-100 text-slate-500">語音辨識</span>}
        {translation && (
          <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="顯示語言">
            {(
              [
                ["orig", "原文"],
                ["zh", "中文"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={(v === "zh") === showTranslation}
                className={`rounded-md px-2.5 py-1 transition ${
                  (v === "zh") === showTranslation
                    ? "bg-white font-semibold text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {state && (
        <div className="space-y-1.5 border-b border-slate-100 bg-slate-50/60 px-3 py-2" aria-live="polite">
          <StatusRow label="原文" tone={tTone} text={tText}>
            {transcript && canForce && !isActive(tStatus) && (
              <LinkButton onClick={() => fetchTranscript({ force: true })} disabled={busy}>
                重新取得原文
              </LinkButton>
            )}
          </StatusRow>
          <StatusRow label="繁中翻譯" tone={xTone} text={xText}>
            {transcript && canTranslate && !isActive(xStatus) && !translation && (
              <LinkButton onClick={() => translate(false)} disabled={posting}>
                {xStatus === "failed" ? "重試翻譯" : "翻譯"}
              </LinkButton>
            )}
            {transcript && canTranslate && !isActive(xStatus) && translation && canForce && (
              <LinkButton onClick={() => translate(true)} disabled={posting}>
                重新翻譯
              </LinkButton>
            )}
          </StatusRow>
          {!isActive(tStatus) && (ambiguous || !transcript || (canForce && available.length > 1)) && (
            <div className={`pt-0.5 ${ambiguous ? "rounded-md bg-amber-50 p-1.5" : ""}`}>{languagePicker}</div>
          )}
          {actionError && <p className="text-xs text-rose-600">{actionError}</p>}
          {loadError && <p className="text-xs text-amber-700">無法更新狀態：{loadError}（會自動重試）</p>}
        </div>
      )}

      {!state && !loadError && (
        <div className="space-y-3 p-4" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${90 - i * 9}%` }} />
          ))}
        </div>
      )}

      {loadError && !state && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
          <p>{loadError}</p>
          <LinkButton onClick={() => void refresh()}>重試</LinkButton>
        </div>
      )}

      {state && !transcript && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
          {isActive(tStatus) ? (
            <p>正在背景取得逐字稿，可以先播放影片。</p>
          ) : (
            <>
              <p>取得帶時間戳的原文逐字稿{state.llmConfigured && state.translationNeeded ? "，並翻譯成繁體中文" : ""}。</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchTranscript({ translate: true })}
                  disabled={busy}
                  className="btn-brand"
                >
                  {state.llmConfigured ? "取得逐字稿並翻譯" : "取得逐字稿"}
                </button>
                {state.llmConfigured && (
                  <button
                    type="button"
                    onClick={() => fetchTranscript({ translate: false })}
                    disabled={busy}
                    className="btn-outline"
                  >
                    只取得原文
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {transcript && (
        <ol
          ref={listRef}
          onScroll={markUserScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {segments.map((seg, i) => (
            <Line
              key={seg.id}
              seg={seg}
              translated={translatedById.get(seg.id)}
              showTranslation={showTranslation}
              active={i === active}
              notes={notesByLine.get(i)}
              lang={transcript.language || undefined}
              onSeek={onSeek}
              onAddNote={onAddNote}
              onShowNote={onShowNote}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
