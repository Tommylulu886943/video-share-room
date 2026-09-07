import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, jsonOk, readJson, requireUser, route } from "@/lib/api";
import { parseMemberFields, validateAttributes } from "@/lib/member-fields";

export const runtime = "nodejs";
export const POST = route(async (req: Request) => {
  const session = await requireUser();
  const { token } = z.object({ token: z.string().trim().regex(/^[a-f0-9]{64}$/, "邀請碼無效或已失效") }).parse(await readJson(req));
  const redirect = await prisma.$transaction(async tx => {
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      include: { tenant: true },
    });
    const invalid = () => new ApiError(404, "邀請碼無效或已失效");
    if (!invitation || invitation.userId !== session.id || invitation.consumedAt || invitation.expiresAt <= new Date()) throw invalid();
    // A removed/demoted administrator cannot leave usable invitations behind.
    const issuer = await tx.user.findUnique({ where: { id: invitation.invitedById }, include: {
      memberships: { where: { tenantId: invitation.tenantId, role: "ADMIN", status: "APPROVED" } },
    } });
    if (!issuer || (issuer.platformRole !== "SUPER_ADMIN" && !issuer.memberships.length)) throw invalid();
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, userId: session.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid();
    const values = validateAttributes(parseMemberFields(invitation.tenant.memberFields), JSON.parse(invitation.attributes));
    const where = { userId_tenantId: { userId: session.id, tenantId: invitation.tenantId } };
    const existing = await tx.membership.findUnique({ where });
    if (existing?.status !== "APPROVED") {
      const data = {
        name: invitation.name, attributes: JSON.stringify(values), level: values.level ?? "",
        status: "APPROVED", role: "MEMBER", canUpload: false,
        reviewedAt: new Date(), reviewedById: invitation.invitedById,
      };
      await tx.membership.upsert({ where, create: { ...data, userId: session.id, tenantId: invitation.tenantId }, update: data });
    }
    return `/t/${invitation.tenant.slug}`;
  });
  return jsonOk({ redirect }, { headers: { "Cache-Control": "no-store" } });
});
