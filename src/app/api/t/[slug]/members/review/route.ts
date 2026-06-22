import { prisma } from "@/lib/db";
import { MembershipStatus } from "@/lib/constants";
import { sendApplicationResult } from "@/lib/members";
import { reviewSchema } from "@/lib/validation";
import {
  ApiError,
  jsonOk,
  readJson,
  requireTenantContext,
  route,
} from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = route(
  async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const { session, ctx } = await requireTenantContext(slug, { admin: true });
    const { membershipId, action } = reviewSchema.parse(await readJson(req));

    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.tenantId !== ctx.tenant.id) {
      throw new ApiError(404, "找不到此申請");
    }
    if (membership.status !== MembershipStatus.PENDING) {
      throw new ApiError(400, "此申請已被處理或尚未完成 email 驗證");
    }

    const approved = action === "approve";
    await prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id: membership.id },
        data: {
          status: approved
            ? MembershipStatus.APPROVED
            : MembershipStatus.REJECTED,
          reviewedAt: new Date(),
          reviewedById: session.id, // always the reviewing User's id
        },
      });
      // When access is revoked, drop any restricted-video grants so they can't
      // be re-gained by a later re-approval (stale allow-list rows).
      if (!approved) {
        await tx.videoAccess.deleteMany({
          where: { membershipId: membership.id },
        });
      }
    });

    await sendApplicationResult(membership.id, approved);

    await recordAudit({
      tenantId: ctx.tenant.id,
      ...auditActor(session, ctx),
      action: approved ? "member.approve" : "member.reject",
      summary: `${approved ? "核可" : "拒絕"}了 ${membership.name} 的入社申請`,
    });

    return jsonOk({ status: approved ? "APPROVED" : "REJECTED" });
  },
);
