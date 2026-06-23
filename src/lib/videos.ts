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

/** Fetch a Bilibili video's title + cover via the public view API (no key). */
export async function fetchBilibiliMeta(
  id: string,
): Promise<{ title: string | null; thumbnailUrl: string | null }> {
  try {
    const ref = id.toLowerCase().startsWith("av")
      ? `aid=${id.slice(2)}`
      : `bvid=${id}`;
    const res = await fetch(
      `https://api.bilibili.com/x/web-interface/view?${ref}`,
      { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return { title: null, thumbnailUrl: null };
    const data = (await res.json()) as {
      code?: number;
      data?: { title?: unknown; pic?: unknown };
    };
    if (data.code !== 0 || !data.data) return { title: null, thumbnailUrl: null };
    const title =
      typeof data.data.title === "string" && data.data.title.trim()
        ? data.data.title.trim().slice(0, 140)
        : null;
    let pic = typeof data.data.pic === "string" ? data.data.pic : null;
    // Force https so the cover isn't blocked as mixed content on our https site.
    if (pic?.startsWith("http://")) pic = `https://${pic.slice(7)}`;
    return { title, thumbnailUrl: pic };
  } catch {
    return { title: null, thumbnailUrl: null };
  }
}

/**
 * Resolve a video's title + stored thumbnail. Title prefers the admin-provided
 * one, else the source's own title, else a placeholder. thumbnailUrl is stored
 * only for sources without a derivable thumb (Bilibili); YouTube derives from id.
 */
export async function resolveVideoMeta(
  provided: string | null | undefined,
  source: string,
  id: string,
): Promise<{ rawTitle: string; thumbnailUrl: string | null }> {
  const given = provided?.trim()?.slice(0, 140) || null;
  if (source === "bilibili") {
    // Always fetch — we need the cover even when a title was supplied.
    const meta = await fetchBilibiliMeta(id);
    return { rawTitle: given || meta.title || "未命名影片", thumbnailUrl: meta.thumbnailUrl };
  }
  // YouTube: only fetch the title when none was supplied; thumb derives from id.
  const rawTitle = given || (await fetchYouTubeTitle(id)) || "未命名影片";
  return { rawTitle, thumbnailUrl: null };
}
