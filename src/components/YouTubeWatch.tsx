"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { VideoEmbed } from "@/components/VideoEmbed";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { NotesPanel, useVideoNotes, type NoteLine, type NotesPanelHandle } from "@/components/VideoNotes";
import { loadYouTubeIframeApi, type YTPlayer } from "@/lib/youtube-iframe";
import { youtubeTimeUrl } from "@/lib/transcript";

/**
 * YouTube player + synced transcript + timestamped member notes.
 * - xl+: three columns — notes | video + details | transcript (both sides sticky)
 * - lg: video + details with notes below | sticky transcript
 * - mobile: video, details, transcript, notes
 */
export function YouTubeWatch({
  slug,
  id,
  videoId,
  title,
  posterUrl,
  canForce,
  children,
}: {
  slug: string;
  id: string;
  videoId: string;
  title: string;
  posterUrl: string | null;
  /** Uploader/admin: may force transcript re-fetch / re-translation. */
  canForce: boolean;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [timeMs, setTimeMs] = useState<number | null>(null);
  // IFrame API unavailable (blocked script etc.) → timestamps open YouTube instead.
  const [apiFailed, setApiFailed] = useState(false);
  const notes = useVideoNotes(slug, id);
  const notesRef = useRef<NotesPanelHandle>(null);
  const [lines, setLines] = useState<NoteLine[]>([]);
  const addNote = useCallback((ms: number) => notesRef.current?.startNote(ms), []);
  const showNote = useCallback((noteId: string) => notesRef.current?.showNote(noteId), []);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !iframeRef.current) return;
        const player = new YT.Player(iframeRef.current, {
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              if (pendingSeek.current !== null) {
                player.seekTo(pendingSeek.current / 1000, true);
                player.playVideo();
                pendingSeek.current = null;
              }
              timer = setInterval(() => {
                const t = player.getCurrentTime?.();
                if (typeof t === "number") setTimeMs(Math.round(t * 1000));
              }, 250);
            },
          },
        });
      })
      .catch(() => {
        // Player still works; only the transcript highlight/seek is unavailable.
        if (!cancelled) setApiFailed(true);
      });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      playerRef.current = null;
    };
  }, [playing]);

  const seek = useCallback(
    (ms: number) => {
      if (apiFailed) {
        window.open(youtubeTimeUrl(videoId, ms), "_blank", "noopener,noreferrer");
        return;
      }
      setTimeMs(ms);
      const player = playerRef.current;
      if (player) {
        player.seekTo(ms / 1000, true);
        player.playVideo();
      } else if (!playing) {
        // Facade still showing: start the embed right at that moment.
        setStartAt(Math.floor(ms / 1000));
        setPlaying(true);
      } else {
        pendingSeek.current = ms;
      }
    },
    [playing, apiFailed, videoId],
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-x-6 xl:grid-cols-[280px_minmax(0,1fr)_340px] 2xl:grid-cols-[320px_minmax(0,1fr)_380px]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1 xl:col-start-2">
        <div className="overflow-hidden rounded-xl bg-black shadow-sm">
          <div className="relative aspect-video">
            <VideoEmbed
              source="youtube"
              videoId={videoId}
              title={title}
              posterUrl={posterUrl}
              playing={playing}
              onPlay={() => setPlaying(true)}
              startSeconds={startAt}
              iframeRef={iframeRef}
            />
          </div>
        </div>
        {children}
      </div>
      <TranscriptPanel
        slug={slug}
        id={id}
        timeMs={timeMs}
        onSeek={seek}
        canForce={canForce}
        notes={notes.notes}
        onAddNote={addNote}
        onShowNote={showNote}
        onLinesChange={setLines}
        className="mt-6 h-[60vh] lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:h-[min(640px,calc(100vh-7rem))] xl:col-start-3 xl:row-span-1 xl:h-[min(720px,calc(100vh-7rem))]"
      />
      <NotesPanel
        ref={notesRef}
        api={notes}
        timeMs={timeMs}
        lines={lines}
        onSeek={seek}
        className="mt-6 min-w-0 lg:col-start-1 lg:row-start-2 xl:sticky xl:top-20 xl:row-start-1 xl:mt-0 xl:h-[min(720px,calc(100vh-7rem))]"
      />
    </div>
  );
}
