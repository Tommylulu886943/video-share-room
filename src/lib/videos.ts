import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { MembershipStatus } from "@/lib/constants";

export async function validateCategory(
  tenantId: string,
  categoryId: string | null | undefined,
): Promise<string | null> {
  if (!categoryId) return null;
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat || cat.tenantId !== tenantId) {
    throw new ApiError(400, "選擇的分類不存在");
  }
  return categoryId;
}

export async function validateTags(
  tenantId: string,
  tagIds: string[],
): Promise<string[]> {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return [];
  const found = await prisma.tag.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new ApiError(400, "包含不存在的標籤");
  }
  return unique;
}

/** Allow-list membership ids must be approved members of this tenant (FR-3). */
export async function validateAccessMemberships(
  tenantId: string,
  membershipIds: string[],
): Promise<string[]> {
  const unique = [...new Set(membershipIds)];
  if (unique.length === 0) return [];
  const found = await prisma.membership.findMany({
    where: {
      id: { in: unique },
      tenantId,
      status: MembershipStatus.APPROVED,
    },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new ApiError(400, "授權名單包含無效或未核可的成員");
  }
  return unique;
}

export function parseRecordedOn(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "拍攝日期格式錯誤");
  return d;
}

export { extractDatePrefix } from "@/lib/dates";

/** Fetch a YouTube video's title via the public oEmbed endpoint (no API key). */
export async function fetchYouTubeTitle(
  youtubeId: string,
): Promise<string | null> {
  try {
    const target = `https://www.youtube.com/watch?v=${youtubeId}`;
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: unknown };
    if (typeof data.title === "string" && data.title.trim()) {
      return data.title.trim().slice(0, 140);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pick the video title: use the admin-provided title, otherwise fall back to
 * the YouTube title, otherwise a placeholder.
 */
export async function resolveVideoTitle(
  provided: string | null | undefined,
  youtubeId: string,
): Promise<string> {
  const trimmed = provided?.trim();
  if (trimmed) return trimmed.slice(0, 140);
  return (await fetchYouTubeTitle(youtubeId)) ?? "未命名影片";
}
