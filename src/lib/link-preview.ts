// Only these public providers may be fetched; redirects must pass the same check.
const HOSTS = new Set([
  "missav.live", "www.missav.live",
  "pornhub.com", "www.pornhub.com", "m.pornhub.com",
  "xvideos.com", "www.xvideos.com", "m.xvideos.com",
]);

function allowedUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (!HOSTS.has(url.hostname) || !["https:", "http:"].includes(url.protocol)
      || url.port || url.username || url.password) return null;
    url.protocol = "https:";
    return url;
  } catch { return null; }
}

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, entity: string) => {
    const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
    const n = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
  });
}

export function parsePreviewImage(html: string, pageUrl: string): string | null {
  const values = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs.set(m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4]));
    }
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    if (key && attrs.get("content") && !values.has(key)) values.set(key, attrs.get("content")!);
  }
  for (const key of ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    const value = values.get(key)?.trim();
    if (!value) continue;
    try {
      const url = new URL(value, pageUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
      url.protocol = "https:";
      return url.href;
    } catch { /* Try the next image. */ }
  }
  return null;
}

export async function fetchLinkThumbnail(input: string): Promise<string | null> {
  let url = allowedUrl(input);
  if (!url) return null;
  const signal = AbortSignal.timeout(6000);
  try {
    for (let hop = 0; hop < 4; hop++) {
      const res: Response = await fetch(url, {
        redirect: "manual", cache: "no-store", signal,
        headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location: string | null = res.headers.get("location");
        await res.body?.cancel();
        url = location ? allowedUrl(new URL(location, url).href) : null;
        if (!url) return null;
        continue;
      }
      if (!res.ok || !res.headers.get("content-type")?.includes("text/html") || !res.body) {
        await res.body?.cancel();
        return null;
      }
      // Bound memory use even when the upstream response has no Content-Length.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let html = "";
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2_000_000) return null;
          html += decoder.decode(value, { stream: true });
        }
        html += decoder.decode();
      } finally { await reader.cancel(); }
      return parsePreviewImage(html, url.href);
    }
  } catch { /* Unavailable previews must not prevent saving a video. */ }
  return null;
}
