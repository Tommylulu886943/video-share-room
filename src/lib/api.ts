import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession, type SessionUser } from "@/lib/session";
import { resolveTenantContext, type TenantContext } from "@/lib/tenant";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) return jsonError(err.status, err.message);
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return jsonError(422, first?.message ?? "輸入資料有誤");
  }
  console.error("[api] unhandled error:", err);
  return jsonError(500, "伺服器發生錯誤");
}

/** Wrap a route handler so thrown ApiError/ZodError become clean JSON responses. */
export function route<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse>,
) {
  return async (...args: A): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "請先登入");
  return session;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "請求格式錯誤");
  }
}

interface TenantGuardOptions {
  /** Require the user to be a tenant admin or super admin. */
  admin?: boolean;
  /** Require upload rights (admin, super admin, or a member granted canUpload). */
  upload?: boolean;
}

/**
 * Resolve and authorise a tenant context for the current user.
 * Throws 404 if the tenant doesn't exist, 403 if the user lacks access.
 */
export async function requireTenantContext(
  slug: string,
  opts: TenantGuardOptions = {},
): Promise<{ session: SessionUser; ctx: TenantContext }> {
  const session = await requireUser();
  const ctx = await resolveTenantContext(slug, session);
  if (!ctx) throw new ApiError(404, "找不到社團");
  if (opts.admin) {
    if (!ctx.isAdmin) throw new ApiError(403, "需要管理者權限");
  } else if (opts.upload) {
    if (!ctx.canUpload) throw new ApiError(403, "你沒有上傳影片的權限");
  } else if (!ctx.isMember) {
    throw new ApiError(403, "你沒有檢視此社團的權限");
  }
  return { session, ctx };
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (session.platformRole !== "SUPER_ADMIN") {
    throw new ApiError(403, "需要平台管理者權限");
  }
  return session;
}
