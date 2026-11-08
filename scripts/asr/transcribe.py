#!/usr/bin/env python3
"""ASR worker for video transcripts (used only when a video has no suitable captions).

Downloads a YouTube video's audio with yt-dlp and transcribes it with
faster-whisper. Prints exactly one JSON object as the last stdout line:

  {"ok": true, "language": "ja", "segments": [{"start_ms": 0, "end_ms": 1234, "text": "..."}]}
  {"ok": false, "error": "audio_unavailable" | "source_restricted" | "asr_failed" | "asr_not_configured", "message": "..."}

Times are integer milliseconds on the original video timeline (faster-whisper
maps VAD-trimmed audio back to original timestamps; no offsets are applied).

Setup (on a host that can run Python, not Vercel serverless):
  pip install -r scripts/asr/requirements.txt
  TRANSCRIPT_ASR_COMMAND="python3 scripts/asr/transcribe.py"
Optional env: ASR_MODEL (default "small"), ASR_DEVICE ("auto"), ASR_COMPUTE_TYPE ("int8").
FFmpeg is not required: audio is decoded by PyAV, bundled with faster-whisper.
"""
import argparse
import json
import os
import re
import sys
import tempfile


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fail(error, message):
    emit({"ok": False, "error": error, "message": str(message)[:500]})
    sys.exit(1)


# Anchored phrases only: a bare "age" used to match "webpage"/"storage" and
# classified ordinary network failures as "source restricted" (non-retryable).
RESTRICTED = re.compile(
    r"(sign in|log ?in|private video|members[- ]only|age[- ]restricted|confirm your age|"
    r"inappropriate for some users|not available in your country|confirm you.re not a bot|"
    r"video (?:is )?blocked|has been blocked)",
    re.I,
)


def download_audio(video_id, workdir):
    try:
        import yt_dlp
    except ImportError as e:
        fail("asr_not_configured", f"yt-dlp not installed: {e}")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(workdir, "audio.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        # yt-dlp's default format sort ranks by language preference first, which
        # puts YouTube's "original" audio track above auto-dubbed ones.
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
    except Exception as e:  # yt_dlp.utils.DownloadError and friends
        msg = str(e)
        fail("source_restricted" if RESTRICTED.search(msg) else "audio_unavailable", msg)
    for name in os.listdir(workdir):
        if name.startswith("audio."):
            return os.path.join(workdir, name)
    fail("audio_unavailable", "no audio file produced")


def transcribe(path, language):
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        fail("asr_not_configured", f"faster-whisper not installed: {e}")
    try:
        model = WhisperModel(
            os.environ.get("ASR_MODEL", "small"),
            device=os.environ.get("ASR_DEVICE", "auto"),
            compute_type=os.environ.get("ASR_COMPUTE_TYPE", "int8"),
        )
        segments, info = model.transcribe(path, language=language or None, vad_filter=False)
        out = []
        for s in segments:
            text = (s.text or "").strip()
            if text:
                out.append({"start_ms": int(round(s.start * 1000)), "end_ms": int(round(s.end * 1000)), "text": text})
        return info.language, out
    except SystemExit:
        raise
    except Exception as e:
        fail("asr_failed", e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video-id", required=True)
    ap.add_argument("--language", default=None)
    args = ap.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", args.video_id):
        fail("asr_failed", "invalid video id")
    with tempfile.TemporaryDirectory(prefix="asr-") as workdir:
        audio = download_audio(args.video_id, workdir)
        language, segments = transcribe(audio, args.language)
    if not segments:
        fail("asr_failed", "no speech recognised")
    emit({"ok": True, "language": language, "segments": segments})


if __name__ == "__main__":
    main()
