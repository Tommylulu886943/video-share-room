// Speech recognition fallback, used only when a video has no suitable captions.
// The platform runs on Node/Vercel, so ASR is delegated to an external worker
// process (scripts/asr/transcribe.py: yt-dlp + faster-whisper) configured with
// TRANSCRIPT_ASR_COMMAND. Without it, ASR is reported as "not configured".
import { execFile } from "node:child_process";
import { TranscriptError, type Cue } from "@/lib/transcript";

const DEFAULT_TIMEOUT_MS = 30 * 60_000;

export function asrConfigured(): boolean {
  return Boolean(process.env.TRANSCRIPT_ASR_COMMAND?.trim());
}

interface WorkerReply {
  ok: boolean;
  language?: string;
  segments?: { start_ms: number; end_ms: number; text: string }[];
  error?: string;
  message?: string;
}

const WORKER_ERRORS = new Set(["audio_unavailable", "source_restricted", "asr_failed", "asr_not_configured"]);

/** Parse the worker's final stdout line (one JSON object). */
export function parseWorkerOutput(stdout: string): WorkerReply | null {
  const line = stdout.trim().split(/\r?\n/).pop();
  if (!line) return null;
  try {
    const v = JSON.parse(line) as WorkerReply;
    return typeof v === "object" && v && typeof v.ok === "boolean" ? v : null;
  } catch {
    return null;
  }
}

/** Convert a worker reply to cues on the original timeline, or throw a classified error. */
export function workerReplyToCues(reply: WorkerReply | null, stderr = ""): { language: string; cues: Cue[] } {
  if (!reply) {
    throw new TranscriptError("asr_failed", `語音辨識程式沒有回傳結果${stderr ? `：${stderr.slice(-300)}` : ""}`);
  }
  if (!reply.ok) {
    const code = WORKER_ERRORS.has(reply.error ?? "") ? reply.error! : "asr_failed";
    const label: Record<string, string> = {
      audio_unavailable: "無法取得影片音訊",
      source_restricted: "YouTube 限制存取，無法取得音訊",
      asr_not_configured: "語音辨識環境未安裝",
      asr_failed: "語音辨識失敗",
    };
    throw new TranscriptError(code, `${label[code]}${reply.message ? `（${reply.message.slice(0, 300)}）` : ""}`);
  }
  const cues: Cue[] = [];
  for (const s of reply.segments ?? []) {
    const start = Math.round(Number(s.start_ms));
    const end = Math.round(Number(s.end_ms));
    const text = String(s.text ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(start) || start < 0 || !text) continue;
    cues.push({ start_ms: start, dur_ms: Number.isFinite(end) && end > start ? end - start : 0, text });
  }
  if (!cues.length || !reply.language) {
    throw new TranscriptError("asr_failed", "語音辨識沒有產生任何文字");
  }
  return { language: reply.language, cues };
}

/** Run the configured ASR worker for a YouTube video. */
export function runAsr(videoId: string, language: string | null): Promise<{ language: string; cues: Cue[] }> {
  const command = process.env.TRANSCRIPT_ASR_COMMAND?.trim();
  if (!command) {
    return Promise.reject(new TranscriptError("asr_not_configured", "語音辨識未設定"));
  }
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Promise.reject(new TranscriptError("asr_failed", "影片 ID 格式錯誤"));
  }
  // No shell: the command is split on whitespace and arguments are passed as-is.
  const [bin, ...base] = command.split(/\s+/);
  const args = [...base, "--video-id", videoId, ...(language ? ["--language", language] : [])];
  const timeout = Number(process.env.TRANSCRIPT_ASR_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const reply = parseWorkerOutput(String(stdout));
      if (err && !reply) {
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        if (e.code === "ENOENT") return reject(new TranscriptError("asr_not_configured", `找不到語音辨識程式：${bin}`));
        if (e.killed) return reject(new TranscriptError("asr_failed", "語音辨識逾時"));
      }
      try {
        resolve(workerReplyToCues(reply, String(stderr)));
      } catch (e) {
        reject(e);
      }
    });
  });
}
