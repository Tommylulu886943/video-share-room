// Video source abstraction (YouTube + Bilibili). Pure module (no deps) so it can
// be imported by server code and standalone scripts alike.

export type VideoSource = "youtube" | "bilibili" | "instagram";

export const SOURCE_LABEL: Record<VideoSource, string> = {
  youtube: "YouTube",
  bilibili: "Bilibili",
  instagram: "Instagram",
};

function parseYouTube(s: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const m = url.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

function parseBilibili(s: string): string | null {
  if (/^BV[0-9A-Za-z]{10}$/.test(s)) return s;
  if (/^av\d+$/i.test(s)) return s.toLowerCase();
  try {
    const url = new URL(s);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "bilibili.com" || host === "m.bilibili.com") {
      const bv = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})/);
      if (bv) return bv[1];
      const av = url.pathname.match(/\/video\/(av\d+)/i);
      if (av) return av[1].toLowerCase();
    }
  } catch {
    return null;
  }
  return null;
}

function parseInstagram(s: string): string | null {
  try {
    const url = new URL(s);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "instagram.com") {
      // /reel/{shortcode}/, /reels/, /p/, /tv/
      const m = url.pathname.match(/\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}

/** Detect the source + canonical id from a URL or bare id. */
export function parseVideoRef(
  input: string,
): { source: VideoSource; id: string } | null {
  const s = input.trim();
  const yt = parseYouTube(s);
  if (yt) return { source: "youtube", id: yt };
  const bv = parseBilibili(s);
  if (bv) return { source: "bilibili", id: bv };
  const ig = parseInstagram(s);
  if (ig) return { source: "instagram", id: ig };
  return null;
}

export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Embeddable player URL. autoplay starts playback when the facade is clicked. */
export function videoEmbed(
  source: string,
  id: string,
  autoplay = false,
): string {
  if (source === "bilibili") {
    const ref = id.toLowerCase().startsWith("av")
      ? `aid=${id.slice(2)}`
      : `bvid=${id}`;
    return `https://player.bilibili.com/player.html?${ref}&page=1&high_quality=1&danmaku=0&autoplay=${autoplay ? 1 : 0}`;
  }
  if (source === "instagram") {
    // Instagram's public embed iframe (no autoplay control available).
    return `https://www.instagram.com/reel/${id}/embed/`;
  }
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1${autoplay ? "&autoplay=1" : ""}`;
}

export function videoWatchUrl(source: string, id: string): string {
  if (source === "bilibili") return `https://www.bilibili.com/video/${id}`;
  if (source === "instagram") return `https://www.instagram.com/reel/${id}/`;
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Vertical sources (e.g. Reels) want a portrait player frame. */
export function isPortraitSource(source: string): boolean {
  return source === "instagram";
}

/**
 * Sources that can play a muted, autoplay preview on hover. Only YouTube allows
 * reliable muted autoplay in an iframe; Bilibili/Instagram block it.
 */
export function supportsHoverPreview(source: string): boolean {
  return source === "youtube";
}

/** Muted, looped, chrome-free embed for hover previews. */
export function videoPreviewEmbed(source: string, id: string): string {
  return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&rel=0&modestbranding=1&playsinline=1`;
}

/** Branded gradient for the placeholder shown when there's no poster. */
export function sourceGradient(source: string): string {
  if (source === "instagram")
    return "bg-gradient-to-br from-fuchsia-600 via-rose-500 to-amber-400";
  if (source === "bilibili")
    return "bg-gradient-to-br from-sky-500 to-pink-500";
  return "bg-gradient-to-br from-slate-700 to-slate-900";
}

/**
 * Board/card poster URL: a stored cover (Bilibili) wins; YouTube derives from
 * its id; otherwise null → caller shows a placeholder.
 */
export function videoPoster(video: {
  source: string;
  youtubeId: string;
  thumbnailUrl: string | null;
}): string | null {
  if (video.thumbnailUrl) return video.thumbnailUrl;
  if (video.source === "youtube") return youtubeThumb(video.youtubeId);
  return null;
}
