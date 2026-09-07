import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, jsonOk, readJson, requireTenantContext, route } from "@/lib/api";
import { attributeValuesSchema, parseMemberFields, validateAttributes } from "@/lib/member-fields";

export const runtime = "nodejs";
export const POST = route(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { session, ctx } = await requireTenantContext(slug, { admin: true });
  const input = z.object({
    identifier: z.string().trim().min(1).max(254),
    name: z.string().trim().min(1).max(60),
    attributes: attributeValuesSchema,
  }).parse(await readJson(req));
  const values = validateAttributes(parseMemberFields(ctx.tenant.memberFields), input.attributes);
  const user = await prisma.user.findFirst({ where: {
    OR: [{ username: input.identifier }, { email: input.identifier.toLowerCase() }],
  } });
  if (!user) throw new ApiError(404, "找不到此帳號，請填寫已註冊的帳號或 Email");
  const member = await prisma.membership.findUnique({ where: {
    userId_tenantId: { userId: user.id, tenantId: ctx.tenant.id },
  } });
  if (member?.status === "APPROVED") throw new ApiError(409, "此帳號已是社團成員");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async tx => {
    await tx.invitation.updateMany({ where: { tenantId: ctx.tenant.id, userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.invitation.create({ data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tenantId: ctx.tenant.id, userId: user.id, invitedById: session.id,
      name: input.name, attributes: JSON.stringify(values), expiresAt,
    } });
  });
  return jsonOk({ token, expiresAt }, { status: 201, headers: { "Cache-Control": "no-store" } });
});

export const DELETE = route(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { ctx } = await requireTenantContext(slug, { admin: true });
  const { id } = z.object({ id: z.string().min(1) }).parse(await readJson(req));
  await prisma.invitation.updateMany({ where: { id, tenantId: ctx.tenant.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return jsonOk({ revoked: true });
});
