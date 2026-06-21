import { prisma } from "@/lib/db";
import { MembershipStatus, TenantRole } from "@/lib/constants";
import {
  notifyAdminOfApplication,
  sendVerificationEmail,
} from "@/lib/members";
import { applySchema } from "@/lib/validation";
import { ApiError, jsonOk, readJson, requireUser, route } from "@/lib/api";

export const runtime = "nodejs";

export const POST = route(async (req: Request) => {
  const session = await requireUser();
  const { tenantSlug, name, level } = applySchema.parse(await readJson(req));

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new ApiError(404, "找不到社團");

  const status = session.emailVerified
    ? MembershipStatus.PENDING
    : MembershipStatus.PENDING_VERIFICATION;

  const existing = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: session.id, tenantId: tenant.id } },
  });

  if (existing && existing.status !== MembershipStatus.REJECTED) {
    throw new ApiError(409, "你已是此社團成員或已送出申請");
  }

  const membership = existing
    ? await prisma.membership.update({
        where: { id: existing.id },
        data: {
          name,
          level,
          status,
          appliedAt: new Date(),
          reviewedAt: null,
          reviewedById: null,
        },
      })
    : await prisma.membership.create({
        data: {
          userId: session.id,
          tenantId: tenant.id,
          name,
          level,
          role: TenantRole.MEMBER,
          status,
        },
      });

  if (status === MembershipStatus.PENDING) {
    await notifyAdminOfApplication(membership.id);
  } else {
    await sendVerificationEmail({ id: session.id, email: session.email }, name);
  }

  return jsonOk({ status });
});
