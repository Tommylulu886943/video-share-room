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

  // Resolve the admin account: reuse an existing user, or create a new one.
  let adminUser = await prisma.user.findFirst({
    where: { OR: [{ username: input.adminUsername }, { email: input.adminEmail }] },
  });

  if (!adminUser) {
    if (!input.adminPassword) {
      throw new ApiError(400, "建立新管理者帳號時必須提供密碼");
    }
    adminUser = await prisma.user.create({
      data: {
        username: input.adminUsername,
        email: input.adminEmail,
        passwordHash: await hashPassword(input.adminPassword),
        emailVerified: true, // provisioned by the platform owner
      },
    });
  }

  const tenant = await prisma.tenant.create({
    data: {
      isPrivate: input.isPrivate,
      memberFields: JSON.stringify(input.memberFields),
      name: input.name,
      slug: input.slug,
      brandColor: input.brandColor ?? "#2563eb",
      brandLogo: input.brandLogo ?? null,
      memberships: {
        create: {
          userId: adminUser.id,
          name: input.adminName,
          level: values.level ?? "",
          attributes: JSON.stringify(values),
          role: TenantRole.ADMIN,
          status: MembershipStatus.APPROVED,
        },
      },
    },
  });

  return jsonOk(tenant, { status: 201 });
});
