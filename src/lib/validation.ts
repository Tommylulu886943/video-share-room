import { z } from "zod";
import { MembershipStatus, Visibility } from "@/lib/constants";

const username = z
  .string()
  .trim()
  .min(3, "帳號至少 3 個字元")
  .max(32, "帳號最多 32 個字元")
  .regex(/^[a-zA-Z0-9_.-]+$/, "帳號僅可使用英數字與 . _ -");

const password = z.string().min(8, "密碼至少 8 個字元").max(128);
const email = z.string().trim().toLowerCase().email("email 格式不正確");
const name = z.string().trim().min(1, "請填寫名稱").max(60);
const level = z.string().trim().min(1, "請填寫級數").max(60);
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/, "代稱僅可使用小寫英數字與 -");

export const registerSchema = z.object({
  username,
  email,
  password,
  name,
  level,
  tenantSlug: slug,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "請輸入帳號或 email"),
  password: z.string().min(1, "請輸入密碼"),
});

export const applySchema = z.object({
  tenantSlug: slug,
  name,
  level,
});

export const reviewSchema = z.object({
  membershipId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "請填寫分類名稱").max(60),
  parentId: z.string().min(1).nullish(),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1, "請填寫標籤名稱").max(40),
});

export const videoCreateSchema = z.object({
  // Optional — when blank the YouTube title is used (see resolveVideoTitle).
  title: z.string().trim().max(140).optional().or(z.literal("")),
  youtube: z.string().trim().min(1, "請填寫 YouTube 連結或 ID"),
  // Optional custom cover image URL (overrides the auto-fetched one).
  thumbnailUrl: z
    .string()
    .trim()
    .url("封面圖網址格式不正確")
    .or(z.literal(""))
    .nullish(),
  notes: z.string().trim().max(2000).or(z.literal("")).nullish(),
  recordedOn: z.string().trim().or(z.literal("")).nullish(),
  categoryId: z.string().min(1).nullish(),
  tagIds: z.array(z.string().min(1)).default([]),
  visibility: z.enum([Visibility.PUBLIC, Visibility.RESTRICTED]),
  accessMembershipIds: z.array(z.string().min(1)).default([]),
});
export type VideoCreateInput = z.infer<typeof videoCreateSchema>;

export const videoUpdateSchema = videoCreateSchema.partial().extend({
  // On edit, a blank YouTube field means "keep the existing video".
  youtube: z.string().trim().optional().or(z.literal("")),
});

// Batch upload: many YouTube links/IDs sharing one set of category/tags/visibility.
export const videoBatchSchema = z.object({
  items: z
    .array(z.string().trim().min(1))
    .min(1, "請至少貼上一個 YouTube 連結或 ID")
    .max(50, "一次最多上傳 50 部影片"),
  categoryId: z.string().min(1).nullish(),
  tagIds: z.array(z.string().min(1)).default([]),
  visibility: z.enum([Visibility.PUBLIC, Visibility.RESTRICTED]),
  accessMembershipIds: z.array(z.string().min(1)).default([]),
});

export const tenantCreateSchema = z.object({
  name: z.string().trim().min(1, "請填寫社團名稱").max(60),
  slug,
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "請使用 #RRGGBB 格式")
    .optional(),
  brandLogo: z.string().trim().max(8).optional(),
  // Admin to assign: either an existing username/email, or new-account fields.
  adminUsername: username,
  adminEmail: email,
  adminPassword: password.optional(),
  adminName: name,
  adminLevel: level.optional(),
});

export const accessUpdateSchema = z.object({
  membershipIds: z.array(z.string().min(1)).default([]),
});

export const brandingSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  // null / "" clears the logo; undefined leaves it unchanged.
  brandLogo: z.string().trim().max(8).or(z.literal("")).nullish(),
});

export const settingsSchema = z.object({
  requireEmailVerification: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  // Category id, or "" / null to clear the default (show all).
  defaultCategoryId: z.string().min(1).or(z.literal("")).nullish(),
});

/** Accept a full YouTube URL or a bare 11-char id; return the canonical id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
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

export { MembershipStatus };
