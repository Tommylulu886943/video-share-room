import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { MembershipStatus, TenantRole } from "@/lib/constants";
import {
  computeApplicationStatus,
  notifyAdminOfApplication,
  sendVerificationEmail,
} from "@/lib/members";
import { loadSessionUser, setSessionCookie } from "@/lib/session";
import { landingPathFor } from "@/lib/nav";
import { registerSchema } from "@/lib/validation";
import { ApiError, jsonOk, readJson, route } from "@/lib/api";

export const runtime = "nodejs";

export const POST = route(async (req: Request) => {
  const input = registerSchema.parse(await readJson(req));

  const tenant = await prisma.tenant.findUnique({
    where: { slug: input.tenantSlug },
  });
  if (!tenant) throw new ApiError(404, "找不到社團");

  // New-account registration. Existing accounts should log in and use 加入社團.
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: input.username }, { email: input.email }] },
  });
  if (existing) {
    if (existing.email === input.email) {
      throw new ApiError(409, "此 email 已註冊，請直接登入後申請加入社團");
    }
    throw new ApiError(409, "此帳號已被使用");
  }

  const { needsVerification, status } = computeApplicationStatus(tenant, false);

  const passwordHash = await hashPassword(input.password);
  const membership = await prisma.membership.create({
    data: {
      name: input.name,
      level: input.level,
      role: TenantRole.MEMBER,
      status,
      tenant: { connect: { id: tenant.id } },
      user: {
        create: {
          username: input.username,
          email: input.email,
          passwordHash,
          // If we're not verifying email, the account is usable immediately.
          emailVerified: !needsVerification,
        },
      },
    },
    include: { user: true },
  });

  if (needsVerification) {
    await sendVerificationEmail(
      { id: membership.userId, email: membership.user.email },
      input.name,
    );
    return jsonOk({ needsVerification: true, status });
  }

  if (status === MembershipStatus.PENDING) {
    await notifyAdminOfApplication(membership.id);
    return jsonOk({ needsVerification: false, status });
  }

  // Auto-approved: log the user straight in.
  await setSessionCookie({
    sub: membership.userId,
    username: membership.user.username,
    platformRole: membership.user.platformRole,
  });
  const session = await loadSessionUser(membership.userId);
  return jsonOk({
    needsVerification: false,
    status,
    redirect: session ? landingPathFor(session) : `/t/${tenant.slug}`,
  });
});
