// How the server reaches YouTube: bot-wall classification and the signed-in
// (YOUTUBE_COOKIES) fallback against fake responses, and YOUTUBE_PROXY_URL
// routing through a real local CONNECT proxy. Real YouTube is not contacted.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { fetchYouTubeCaptions, isBotCheck, TranscriptError } from "../src/lib/transcript";
import { createHash } from "node:crypto";
import { parseYouTubeCookies, sidAuthorization, youtubeAuthHeaders, youtubeFetch } from "../src/lib/youtube-fetch";

const player = (playabilityStatus: object) => ({
  fetchImpl: (async () => new Response(JSON.stringify({ playabilityStatus }), { status: 200 })) as unknown as typeof fetch,
});
const BOT = { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you’re not a bot" };

async function errorOf(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    assert.ok(e instanceof TranscriptError);
    return e;
  }
}

test("cloud-IP bot wall is reported as youtube_blocked, not as a restricted video", async () => {
  assert.equal(isBotCheck("LOGIN_REQUIRED", "Sign in to confirm you’re not a bot"), true);
  assert.equal(isBotCheck("LOGIN_REQUIRED", "Sign in to confirm your age"), false);
  assert.equal(isBotCheck("UNPLAYABLE", "bot"), false);

  const blocked = await errorOf(
    fetchYouTubeCaptions("S9qKB6pLLlY", null, player(BOT)),
  );
  assert.equal(blocked?.code, "youtube_blocked");
  assert.equal(blocked?.retryable, false);
  // Operator guidance lives in `detail.hint`; members only see the plain message.
  assert.match(String(blocked!.detail?.hint), /YOUTUBE_COOKIES/);
  assert.doesNotMatch(blocked!.message, /YOUTUBE_COOKIES/);

  const age = await errorOf(
    fetchYouTubeCaptions("S9qKB6pLLlY", null, player({ status: "LOGIN_REQUIRED", reason: "Sign in to confirm your age" })),
  );
  assert.equal(age?.code, "source_restricted");
  const priv = await errorOf(fetchYouTubeCaptions("S9qKB6pLLlY", null, player({ status: "ERROR", reason: "Video unavailable" })));
  assert.equal(priv?.code, "source_restricted");
});

const COOKIE = "SID=sid1; HSID=h; SAPISID=sap-123; __Secure-1PAPISID=one-456; __Secure-3PAPISID=three-789; LOGIN_INFO=x";

test("YOUTUBE_COOKIES: header string and cookies.txt both parse; SAPISIDHASH matches Google's scheme", () => {
  const fromHeader = parseYouTubeCookies(`Cookie: ${COOKIE}`);
  assert.equal(fromHeader.get("SAPISID"), "sap-123");
  const txt = [
    "# Netscape HTTP Cookie File",
    ".youtube.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\tsap-123",
    "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\tsid1",
    ".google.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\tother-domain",
  ].join("\n");
  const fromTxt = parseYouTubeCookies(txt);
  assert.deepEqual([...fromTxt], [["SAPISID", "sap-123"], ["SID", "sid1"]]); // google.com dropped

  const now = 1_700_000_000_000;
  const sha = (s: string) => createHash("sha1").update(s).digest("hex");
  assert.equal(
    sidAuthorization(fromHeader, now),
    `SAPISIDHASH 1700000000_${sha("1700000000 sap-123 https://www.youtube.com")} ` +
      `SAPISID1PHASH 1700000000_${sha("1700000000 one-456 https://www.youtube.com")} ` +
      `SAPISID3PHASH 1700000000_${sha("1700000000 three-789 https://www.youtube.com")}`,
  );
  assert.equal(youtubeAuthHeaders("PREF=f6=40000000", now), null); // signed-out cookies are useless
  assert.equal(youtubeAuthHeaders("", now), null);
  assert.match(youtubeAuthHeaders(COOKIE, now)!.Cookie, /SAPISID=sap-123/);
});

test("bot wall + cookies → retried as a signed-in TV client, captions downloaded with the cookie", async () => {
  const calls: { url: string; body?: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const timedtext = "https://www.youtube.com/api/timedtext?v=S9qKB6pLLlY&lang=ja&kind=asr&fmt=srv3";
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body, headers });
    if (url.endsWith("/tv")) return new Response('{"INNERTUBE_CLIENT_VERSION":"7.20991231.00.00"}');
    if (url.includes("/player")) {
      if (body.context.client.clientName === "ANDROID") return Response.json({ playabilityStatus: BOT });
      return Response.json({
        playabilityStatus: { status: "OK" },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: timedtext, languageCode: "ja", kind: "asr" }] } },
      });
    }
    if (url.includes("/api/timedtext")) return new Response('<transcript><text start="121.2" dur="1.5">面</text></transcript>');
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;

  const auth = async () => youtubeAuthHeaders(COOKIE)!;
  const out = await fetchYouTubeCaptions("S9qKB6pLLlY", null, { fetchImpl, auth });
  assert.equal(out.kind, "ok");
  assert.deepEqual(out.kind === "ok" && out.segments, [{ id: "seg-0001", start_ms: 121_200, end_ms: 122_700, text: "面" }]);

  const players = calls.filter((c) => c.url.includes("/player"));
  assert.deepEqual(players.map((c) => (c.body!.context as { client: { clientName: string } }).client.clientName), ["ANDROID", "TVHTML5"]);
  assert.equal(players[0].headers.Cookie, undefined); // the account is only used after the bot wall
  const tv = players[1];
  assert.equal((tv.body!.context as { client: { clientVersion: string } }).client.clientVersion, "7.20991231.00.00");
  assert.match(tv.headers.Authorization, /^SAPISIDHASH \d+_[0-9a-f]{40} /);
  assert.match(tv.headers.Cookie, /SAPISID=sap-123/);
  const caption = calls.find((c) => c.url.includes("/api/timedtext"))!;
  assert.match(caption.headers.Cookie, /SAPISID=sap-123/);
  assert.ok(!caption.url.includes("fmt="));

  // Without cookies the same wall is a plain youtube_blocked; a rejected session is its own error.
  const plain = await errorOf(fetchYouTubeCaptions("S9qKB6pLLlY", null, { fetchImpl }));
  assert.equal(plain?.code, "youtube_blocked");
  const rejected = (async (input: string | URL) =>
    String(input).endsWith("/tv") ? new Response("") : Response.json({ playabilityStatus: BOT })) as unknown as typeof fetch;
  const expired = await errorOf(fetchYouTubeCaptions("S9qKB6pLLlY", null, { fetchImpl: rejected, auth }));
  assert.equal(expired?.code, "youtube_auth_failed");
});

let target: Server;
let proxy: Server;
let targetUrl = "";
const tunnels: string[] = [];

before(async () => {
  target = createServer((_req, res) => res.end("hello from target"));
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}/x`;
  // Minimal HTTP CONNECT proxy (what residential proxy services speak).
  proxy = createServer();
  proxy.on("connect", (req, client, head) => {
    tunnels.push(req.url ?? "");
    const [host, port] = (req.url ?? "").split(":");
    const upstream = connect(Number(port), host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
  });
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
});

after(() => {
  delete process.env.YOUTUBE_PROXY_URL;
  proxy.closeAllConnections?.();
  target.closeAllConnections?.();
  proxy.close();
  target.close();
});

test("YOUTUBE_PROXY_URL routes YouTube requests through the proxy; unset goes direct", async () => {
  delete process.env.YOUTUBE_PROXY_URL;
  assert.equal(youtubeFetch(), fetch);
  assert.equal(await (await youtubeFetch()(targetUrl)).text(), "hello from target");
  assert.equal(tunnels.length, 0);

  process.env.YOUTUBE_PROXY_URL = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  // Same init shape as ytFetch in transcript.ts.
  const init: RequestInit = { headers: { "User-Agent": "test" }, signal: AbortSignal.timeout(5000), cache: "no-store" };
  const res = await youtubeFetch()(targetUrl, init);
  assert.equal(await res.text(), "hello from target");
  assert.deepEqual(tunnels, [new URL(targetUrl).host]);
});
