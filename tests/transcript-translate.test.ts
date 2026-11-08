// OpenAI-compatible (NVIDIA NIM) translation client against a local fake
// server. This proves request/response handling, not real NIM output quality.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  parseJsonReply,
  translateBatch,
  translateConfig,
  translateModel,
} from "../src/lib/transcript-translate";

const KEYS = [
  "TRANSCRIPT_TRANSLATE_PROVIDER",
  "TRANSCRIPT_TRANSLATE_MODEL",
  "TRANSCRIPT_TRANSLATE_BASE_URL",
  "TRANSCRIPT_TRANSLATE_API_KEY",
  "NVIDIA_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
];
function setEnv(vars: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
}

type Handler = (body: Record<string, unknown>, req: IncomingMessage) => { status: number; json?: unknown; headers?: Record<string, string> };
let handler: Handler;
let requests: { body: Record<string, unknown>; auth?: string }[] = [];
let server: Server;
let baseUrl = "";

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      requests.push({ body, auth: req.headers.authorization });
      const r = handler(body, req);
      res.writeHead(r.status, { "content-type": "application/json", ...r.headers });
      res.end(JSON.stringify(r.json ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
after(() => server.close());

const reply = (content: string, finish = "stop") => ({
  status: 200,
  json: { choices: [{ finish_reason: finish, message: { role: "assistant", content } }] },
});
const input = {
  segments: [
    { id: "seg-0001", text: "下を攻めて" },
    { id: "seg-0002", text: "面" },
  ],
  contextBefore: ["前の文"],
  from: "ja",
  to: "zh-TW",
};

test("provider selection: explicit wins; otherwise NIM key, then Anthropic key; nothing → unconfigured", () => {
  setEnv({});
  assert.equal(translateConfig(), null);
  setEnv({ NVIDIA_API_KEY: "nv" });
  assert.deepEqual(translateConfig(), {
    provider: "nim",
    model: "z-ai/glm-5.3-flash",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKey: "nv",
  });
  assert.equal(translateModel(), "nim:z-ai/glm-5.3-flash");
  setEnv({ ANTHROPIC_API_KEY: "sk", NVIDIA_API_KEY: "nv", TRANSCRIPT_TRANSLATE_PROVIDER: "anthropic" });
  assert.equal(translateConfig()?.provider, "anthropic");
  setEnv({ ANTHROPIC_API_KEY: "sk" });
  assert.equal(translateConfig()?.model, "claude-opus-5-5");
  setEnv({ TRANSCRIPT_TRANSLATE_PROVIDER: "nim" }); // chosen but no key
  assert.equal(translateConfig(), null);
  setEnv({ TRANSCRIPT_TRANSLATE_PROVIDER: "openai", TRANSCRIPT_TRANSLATE_BASE_URL: "http://localhost:11434/v1/" });
  assert.equal(translateConfig(), null); // generic endpoint needs an explicit model
  setEnv({
    TRANSCRIPT_TRANSLATE_PROVIDER: "openai",
    TRANSCRIPT_TRANSLATE_BASE_URL: "http://localhost:11434/v1/",
    TRANSCRIPT_TRANSLATE_MODEL: "qwen3",
  });
  assert.deepEqual(translateConfig(), {
    provider: "openai",
    model: "qwen3",
    baseUrl: "http://localhost:11434/v1",
    apiKey: undefined,
  });
  setEnv({ TRANSCRIPT_TRANSLATE_PROVIDER: "bogus", NVIDIA_API_KEY: "nv" });
  assert.equal(translateConfig(), null);
});

test("JSON replies are extracted from reasoning tags, fences and prose", () => {
  const segs = [{ id: "seg-0001", text: "攻下段" }];
  assert.deepEqual(parseJsonReply('{"segments":[{"id":"seg-0001","text":"攻下段"}]}'), segs);
  assert.deepEqual(
    parseJsonReply('<think>先想想 {not json}</think>\n```json\n{"segments":[{"id":"seg-0001","text":"攻下段"}]}\n```'),
    segs,
  );
  assert.deepEqual(parseJsonReply('Here you go: {"segments":[{"id":"seg-0001","text":"攻下段"}]} Done.'), segs);
  assert.equal(parseJsonReply("抱歉，我無法翻譯"), null);
  assert.equal(parseJsonReply('{"translations":[]}'), null);
});

test("NIM request carries the key, model and JSON mode; reply is returned as-is for validation", async () => {
  setEnv({ NVIDIA_API_KEY: "nvapi-test", TRANSCRIPT_TRANSLATE_BASE_URL: baseUrl, TRANSCRIPT_TRANSLATE_MODEL: "moonshotai/kimi-k2.6" });
  requests = [];
  handler = () => reply('{"segments":[{"id":"seg-0001","text":"攻下段"},{"id":"seg-0002","text":"面"}]}');
  const out = await translateBatch(input);
  assert.deepEqual(out, [
    { id: "seg-0001", text: "攻下段" },
    { id: "seg-0002", text: "面" },
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].auth, "Bearer nvapi-test");
  assert.equal(requests[0].body.model, "moonshotai/kimi-k2.6");
  assert.deepEqual(requests[0].body.response_format, { type: "json_object" });
  assert.equal(requests[0].body.reasoning_effort, "low");
  const msgs = requests[0].body.messages as { role: string; content: string }[];
  assert.match(msgs[0].content, /Traditional Chinese/);
  assert.deepEqual(JSON.parse(msgs[1].content).segments, input.segments); // ids + text only, no timestamps
});

test("falls back without JSON mode when the model rejects response_format; retries 429", async () => {
  setEnv({ NVIDIA_API_KEY: "k", TRANSCRIPT_TRANSLATE_BASE_URL: baseUrl });
  requests = [];
  let n = 0;
  handler = (body) => {
    n++;
    if (body.reasoning_effort) return { status: 400, json: { detail: "unknown field reasoning_effort" } };
    if (body.response_format) return { status: 400, json: { detail: "response_format is not supported" } };
    if (n === 3) return { status: 429, json: {}, headers: { "retry-after": "1" } };
    return reply('{"segments":[{"id":"seg-0001","text":"甲"},{"id":"seg-0002","text":"乙"}]}');
  };
  const out = await translateBatch(input);
  assert.equal(out.length, 2);
  assert.equal(requests.length, 4);
  assert.equal(requests[3].body.response_format, undefined);
  assert.equal(requests[3].body.reasoning_effort, undefined);
});

test("errors are classified: auth, missing model, truncation, garbage, server errors", async () => {
  setEnv({ NVIDIA_API_KEY: "k", TRANSCRIPT_TRANSLATE_BASE_URL: baseUrl });
  const code = async () => {
    try {
      await translateBatch(input);
      return "ok";
    } catch (e) {
      return `${(e as { code: string }).code}:${(e as { retryable: boolean }).retryable}`;
    }
  };
  handler = () => ({ status: 401, json: { detail: "Unauthorized" } });
  assert.equal(await code(), "llm_auth_failed:false");
  handler = () => ({ status: 404, json: { detail: "Not found" } });
  assert.equal(await code(), "llm_not_configured:false");
  handler = () => reply('{"segments":[{"id":"seg-0001","text":"甲', "length");
  assert.equal(await code(), "translation_too_long:true");
  handler = () => reply("I cannot help with that.");
  assert.equal(await code(), "translation_invalid:true");
  handler = () => ({ status: 503, json: {} });
  assert.equal(await code(), "translation_failed:true");
});
