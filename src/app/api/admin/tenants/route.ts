import { validateAttributes } from "@/lib/member-fields";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { MembershipStatus, TenantRole } from "@/lib/constants";
import { tenantCreateSchema } from "@/lib/validation";
import {
  ApiError,
  jsonOk,
  readJson,
  requireSuperAdmin,
  route,
} from "@/lib/api";

export const runtime = "nodejs";

export const POST = route(async (req: Request) => {
  await requireSuperAdmin();
  const input = tenantCreateSchema.parse(await readJson(req));

  const values = validateAttributes(input.memberFields, input.adminAttributes);

  const slugTaken = await prisma.tenant.findUnique({
    where: { slug: input.slug },
  });
  if (slugTaken) throw new ApiError(409, "此社團代稱已被使用");

  // Resolve the admin account: reuse an existing user only when BOTH the
  // username and the email point at the same account; otherwise the operator
  // typed a taken username (or email) for what they meant to be a new account,
  // and silently promoting a stranger would be wrong.
  const matches = await prisma.user.findMany({
    where: { OR: [{ username: input.adminUsername }, { email: input.adminEmail }] },
  });
  const existing = matches.find(
    (u) => u.username === input.adminUsername && u.email === input.adminEmail,
  );
  if (!existing && matches.length > 0) {
    const byName = matches.some((u) => u.username === input.adminUsername);
    throw new ApiError(
      409,
      byName
        ? "此帳號已存在但 email 不符；若要指定既有帳號，請填入該帳號的 email"
        : "此 email 已被其他帳號使用；若要指定既有帳號，請填入該帳號的帳號名稱",
    );
  }
  if (!existing && !input.adminPassword) {
    throw new ApiError(400, "建立新管理者帳號時必須提供密碼");
  }

  const membershipBase = {
    name: input.adminName,
    level: values.level ?? "",
    attributes: JSON.stringify(values),
    role: TenantRole.ADMIN,
    status: MembershipStatus.APPROVED,
  };

  // One nested create: tenant + admin membership (+ the new user when needed)
  // commit together, so a failure never leaves an orphan account behind.
  const tenant = await prisma.tenant.create({
    data: {
      isPrivate: input.isPrivate,
      memberFields: JSON.stringify(input.memberFields),
      name: input.name,
      slug: input.slug,
      brandColor: input.brandColor ?? "#2563eb",
      brandLogo: input.brandLogo ?? null,
      memberships: {
        create: existing
          ? { ...membershipBase, user: { connect: { id: existing.id } } }
          : {
              ...membershipBase,
              user: {
                create: {
                  username: input.adminUsername,
                  email: input.adminEmail,
                  passwordHash: await hashPassword(input.adminPassword as string),
                  emailVerified: true, // provisioned by the platform owner
                },
              },
            },
      },
    },
  });

  return jsonOk(tenant, { status: 201 });
});
