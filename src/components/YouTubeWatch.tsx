"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { VideoEmbed } from "@/components/VideoEmbed";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { loadYouTubeIframeApi, type YTPlayer } from "@/lib/youtube-iframe";

/**
 * YouTube player + synced transcript. Desktop: transcript in a sticky column
 * beside the video; mobile: stacked below the video details (`children`).
 */
export function YouTubeWatch({
  slug,
  id,
  videoId,
  title,
  posterUrl,
  children,
}: {
  slug: string;
  id: string;
  videoId: string;
  title: string;
  posterUrl: string | null;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [timeMs, setTimeMs] = useState<number | null>(null);

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
      });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      playerRef.current = null;
    };
  }, [playing]);

  const seek = useCallback(
    (ms: number) => {
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
    [playing],
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      <div className="min-w-0">
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
        className="mt-6 h-[60vh] lg:sticky lg:top-20 lg:mt-0 lg:h-[min(640px,calc(100vh-7rem))]"
      />
    </div>
  );
}
