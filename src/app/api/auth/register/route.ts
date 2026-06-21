import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { MembershipStatus, TenantRole } from "@/lib/constants";
import { sendVerificationEmail } from "@/lib/members";
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

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      passwordHash,
      emailVerified: false,
      memberships: {
        create: {
          tenantId: tenant.id,
          name: input.name,
          level: input.level,
          role: TenantRole.MEMBER,
          status: MembershipStatus.PENDING_VERIFICATION,
        },
      },
    },
  });

  await sendVerificationEmail({ id: user.id, email: user.email }, input.name);

  return jsonOk({ needsVerification: true });
});
