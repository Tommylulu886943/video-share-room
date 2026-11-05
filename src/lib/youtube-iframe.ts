// Minimal loader + types for the official YouTube IFrame Player API, used to
// read the playback position and seek an embedded player (transcript sync).

export interface YTPlayer {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLIFrameElement | string,
    opts: { events?: { onReady?: () => void } },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loader: Promise<YTNamespace> | null = null;

export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player && window.YT.loaded) return Promise.resolve(window.YT);
  if (loader) return loader;
  loader = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      loader = null;
      reject(new Error("YouTube IFrame API failed to load"));
    };
    document.head.appendChild(script);
  });
  return loader;
}
