import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import type { TenantContext } from "@/lib/tenant";

/** Who performed an action: the user id + a display name snapshot. */
export function auditActor(
  session: SessionUser,
  ctx: TenantContext,
): { actorUserId: string; actorName: string } {
  return {
    actorUserId: session.id,
    actorName: ctx.membership?.name || session.username,
  };
}

/**
 * Append an entry to a tenant's audit log. Best-effort: a logging failure must
 * never break the action it records.
 */
export async function recordAudit(input: {
  tenantId: string;
  actorUserId?: string | null;
  actorName: string;
  action: string;
  summary: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        actorName: input.actorName,
        action: input.action,
        summary: input.summary,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record:", err);
  }
}
