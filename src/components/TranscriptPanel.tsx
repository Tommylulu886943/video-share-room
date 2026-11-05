"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "@/lib/client";
import { activeSegmentIndex, isAlreadyTarget, type Segment } from "@/lib/transcript";
import type { TranscriptLang, TranscriptPayload } from "@/lib/transcript-store";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: TranscriptPayload };

/** Pause auto-follow this long after the user scrolls the list themselves. */
const USER_SCROLL_PAUSE_MS = 5000;

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const Line = memo(function Line({
  seg,
  original,
  active,
  onSeek,
}: {
  seg: Segment;
  original: string | null;
  active: boolean;
  onSeek: (ms: number) => void;
}) {
  return (
    <li data-active={active || undefined}>
      <button
        type="button"
        onClick={() => onSeek(seg[0])}
        className={`flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition ${
          active
            ? "bg-[var(--brand)]/10 text-slate-900"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <span
          className={`shrink-0 pt-px font-mono text-xs tabular-nums ${
            active ? "font-semibold text-[var(--brand)]" : "text-slate-400"
          }`}
        >
          {fmt(seg[0])}
        </span>
        <span className="min-w-0">
          <span className={active ? "font-medium" : undefined}>{seg[2]}</span>
          {original && original !== seg[2] && (
            <span className="mt-0.5 block text-xs text-slate-400">{original}</span>
          )}
        </span>
      </button>
    </li>
  );
});

export function TranscriptPanel({
  slug,
  id,
  timeMs,
  onSeek,
  className = "",
}: {
  slug: string;
  id: string;
  timeMs: number | null;
  onSeek: (ms: number) => void;
  className?: string;
}) {
  const [lang, setLang] = useState<TranscriptLang>("orig");
  const [loads, setLoads] = useState<Partial<Record<TranscriptLang, Load>>>({});
  const listRef = useRef<HTMLOListElement>(null);
  const userScrollAt = useRef(0);

  // Results land asynchronously; a missing entry renders as "loading".
  const fetchLang = useCallback(
    (l: TranscriptLang) =>
      apiGet<TranscriptPayload>(`/api/t/${slug}/videos/${id}/transcript?lang=${l}`)
        .then((data) => setLoads((prev) => ({ ...prev, [l]: { state: "ready", data } })))
        .catch((e: Error) =>
          setLoads((prev) => ({ ...prev, [l]: { state: "error", message: e.message } })),
        ),
    [slug, id],
  );

  const load = (l: TranscriptLang) => {
    setLoads((prev) => ({ ...prev, [l]: { state: "loading" } }));
    void fetchLang(l);
  };

  useEffect(() => {
    void fetchLang("orig");
  }, [fetchLang]);

  const orig = loads.orig?.state === "ready" ? loads.orig.data : null;
  const current = loads[lang];
  const shown = current?.state === "ready" ? current.data : null;
  const canTranslate =
    orig?.status === "ok" && !!orig.sourceLang && !isAlreadyTarget(orig.sourceLang);

  const pickLang = (l: TranscriptLang) => {
    setLang(l);
    const st = loads[l]?.state;
    if (!st || st === "error") load(l);
  };

  const segments = useMemo(() => shown?.segments ?? [], [shown]);
  const active = timeMs === null ? -1 : activeSegmentIndex(segments, timeMs);

  // Keep the active line in view (inside the panel only — never scroll the page).
  useEffect(() => {
    const list = listRef.current;
    if (!list || active < 0) return;
    if (Date.now() - userScrollAt.current < USER_SCROLL_PAUSE_MS) return;
    const el = list.querySelector<HTMLElement>("[data-active]");
    if (!el) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - list.clientHeight / 3), behavior: "smooth" });
    }
  }, [active, lang]);

  const markUserScroll = () => {
    userScrollAt.current = Date.now();
  };

  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <h2 className="font-semibold text-slate-900">逐字稿</h2>
        {orig?.kind === "asr" && (
          <span className="chip bg-slate-100 text-slate-500">自動生成</span>
        )}
        {canTranslate && (
          <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="字幕語言">
            {(
              [
                ["orig", "原文"],
                ["zh-TW", "中文"],
              ] as const
            ).map(([l, label]) => (
              <button
                key={l}
                type="button"
                onClick={() => pickLang(l)}
                aria-pressed={lang === l}
                className={`rounded-md px-2.5 py-1 transition ${
                  lang === l ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {(!current || current.state === "loading") && (
        <div className="space-y-3 p-4" aria-busy="true">
          <p className="text-xs text-slate-400">{lang === "orig" ? "載入字幕中…" : "翻譯中，第一次需要幾秒鐘…"}</p>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${90 - i * 9}%` }} />
          ))}
        </div>
      )}

      {current?.state === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
          <p>{current.message}</p>
          <button type="button" onClick={() => load(lang)} className="text-[var(--brand)] hover:underline">
            重試
          </button>
        </div>
      )}

      {shown?.status === "none" && (
        <p className="flex flex-1 items-center justify-center p-6 text-sm text-slate-400">此影片沒有字幕</p>
      )}

      {shown?.status === "ok" && (
        <ol
          ref={listRef}
          onWheel={markUserScroll}
          onTouchMove={markUserScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {segments.map((seg, i) => (
            <Line
              key={seg[0] + ":" + i}
              seg={seg}
              original={lang !== "orig" ? (orig?.segments[i]?.[2] ?? null) : null}
              active={i === active}
              onSeek={onSeek}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
