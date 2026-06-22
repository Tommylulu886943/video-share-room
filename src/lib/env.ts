// Centralised, server-only environment access with sane dev defaults.
// (Next.js loads .env automatically for server code.)

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const DEV_AUTH_SECRET = "dev-only-change-me-please-32chars-min-secret-0001";

/**
 * The session-signing secret. In production we FAIL CLOSED: AUTH_SECRET must be
 * set and at least 32 chars, otherwise the app refuses to boot — never silently
 * fall back to the public dev default (which would let anyone forge sessions).
 */
function resolveAuthSecret(): string {
  if (process.env.NODE_ENV === "production") {
    const v = process.env.AUTH_SECRET;
    if (!v || v.length < 32) {
      throw new Error(
        "AUTH_SECRET must be set to a value of at least 32 characters in production.",
      );
    }
    return v;
  }
  return str("AUTH_SECRET", DEV_AUTH_SECRET);
}

export const env = {
  // Lazy: validated on first use (signing/verifying), not at import — so a build
  // (or preview deploy) doesn't fail merely for lacking a runtime secret.
  get authSecret(): string {
    return resolveAuthSecret();
  },
  sessionTtlSeconds: int("SESSION_TTL_SECONDS", 60 * 60 * 24 * 7),
  appUrl: str("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  appName: str("APP_NAME", "場邊 Courtside"),

  email: {
    provider: str("EMAIL_PROVIDER", "console") as "console" | "smtp" | "resend",
    from: str("EMAIL_FROM", "場邊 Courtside <onboarding@resend.dev>"),
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    smtp: {
      host: process.env.SMTP_HOST ?? "",
      port: int("SMTP_PORT", 587),
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  },
};
