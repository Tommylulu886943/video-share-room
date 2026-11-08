// Server-only: how the server reaches YouTube. YouTube answers requests from
// cloud/datacenter IPs (Vercel, AWS, …) with "Sign in to confirm you're not a
// bot". Two ways around it in production:
// - YOUTUBE_PROXY_URL: route YouTube traffic through a (residential) proxy.
// - YOUTUBE_COOKIES: a signed-in YouTube session (use a dedicated account) —
//   the bot wall is then retried as a signed-in TV client.
// Both unset → direct, as in local dev on a home connection.
import { createHash } from "node:crypto";
import { fetch as undiciFetch, ProxyAgent } from "undici";

let cached: { url: string; fetch: typeof fetch } | null = null;

export function youtubeProxyUrl(): string | null {
  return process.env.YOUTUBE_PROXY_URL?.trim() || null;
}

/** fetch for YouTube requests: through YOUTUBE_PROXY_URL when set. */
export function youtubeFetch(): typeof fetch {
  const proxy = youtubeProxyUrl();
  if (!proxy) return fetch;
  if (cached?.url !== proxy) {
    const dispatcher = new ProxyAgent(proxy);
    const proxied = (input: string | URL | Request, init?: RequestInit) =>
      undiciFetch(input as Parameters<typeof undiciFetch>[0], {
        ...(init as Parameters<typeof undiciFetch>[1]),
        dispatcher,
      });
    cached = { url: proxy, fetch: proxied as unknown as typeof fetch };
  }
  return cached.fetch;
}

/**
 * Parse YOUTUBE_COOKIES into name → value. Accepts either a Cookie header
 * ("a=1; b=2", optionally prefixed "Cookie:") or a Netscape cookies.txt export
 * (only youtube.com cookies are kept).
 */
export function parseYouTubeCookies(raw: string | undefined | null): Map<string, string> {
  const jar = new Map<string, string>();
  const text = raw?.trim();
  if (!text) return jar;
  if (text.includes("\t")) {
    for (const line of text.split(/\r?\n/)) {
      const l = line.startsWith("#HttpOnly_") ? line.slice("#HttpOnly_".length) : line;
      if (!l || l.startsWith("#")) continue;
      const f = l.split("\t");
      if (f.length < 7 || !/(^|\.)youtube\.com$/.test(f[0])) continue;
      jar.set(f[5], f[6]);
    }
    return jar;
  }
  for (const part of text.replace(/^cookie:\s*/i, "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return jar;
}

const ORIGIN = "https://www.youtube.com";

/** Google's cookie-session auth: "<scheme> <ts>_<sha1(ts SID origin)>" per available SID cookie. */
export function sidAuthorization(jar: Map<string, string>, nowMs = Date.now()): string | null {
  const ts = Math.round(nowMs / 1000);
  const part = (scheme: string, sid: string | undefined) =>
    sid ? `${scheme} ${ts}_${createHash("sha1").update(`${ts} ${sid} ${ORIGIN}`).digest("hex")}` : null;
  const parts = [
    part("SAPISIDHASH", jar.get("SAPISID") ?? jar.get("__Secure-3PAPISID")),
    part("SAPISID1PHASH", jar.get("__Secure-1PAPISID")),
    part("SAPISID3PHASH", jar.get("__Secure-3PAPISID")),
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** Headers for a signed-in YouTube request, or null when YOUTUBE_COOKIES is unset/unusable. */
export function youtubeAuthHeaders(raw = process.env.YOUTUBE_COOKIES, nowMs = Date.now()): Record<string, string> | null {
  const jar = parseYouTubeCookies(raw);
  const authorization = sidAuthorization(jar, nowMs);
  if (!authorization) return null; // no SAPISID → not a signed-in session
  return {
    Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    Authorization: authorization,
    "X-Goog-AuthUser": "0",
  };
}

/** Caption-fetch auth hook (fresh timestamp per request), or undefined when not configured. */
export function youtubeAuth(): (() => Promise<Record<string, string>>) | undefined {
  if (!youtubeAuthHeaders()) return undefined;
  return async () => youtubeAuthHeaders() ?? {};
}
