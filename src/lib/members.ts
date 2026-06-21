import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { MembershipStatus, TenantRole } from "@/lib/constants";
import {
  sendMail,
  tmplAdminNewApplicant,
  tmplApplicationResult,
  tmplVerifyEmail,
} from "@/lib/email";
import { createEmailVerifyToken, emailVerifyLink } from "@/lib/tokens";

/** The approved ADMIN membership of a tenant (D3: exactly one per tenant). */
export async function getTenantAdmin(tenantId: string) {
  return prisma.membership.findFirst({
    where: {
      tenantId,
      role: TenantRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
    include: { user: true, tenant: true },
  });
}

export async function sendVerificationEmail(user: {
  id: string;
  email: string;
}, displayName: string): Promise<void> {
  const token = await createEmailVerifyToken(user.id);
  const link = emailVerifyLink(token);
  await sendMail({ ...tmplVerifyEmail(displayName, link), to: user.email });
}

/** Notify the tenant admin that a (verified) applicant is awaiting review. */
export async function notifyAdminOfApplication(membershipId: string): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { tenant: true, user: true },
  });
  if (!membership) return;

  const admin = await getTenantAdmin(membership.tenantId);
  if (!admin) {
    console.warn(
      `[members] no admin for tenant ${membership.tenant.slug}; cannot notify of application ${membershipId}`,
    );
    return;
  }

  const reviewLink = `${env.appUrl}/t/${membership.tenant.slug}/admin/members`;
  await sendMail({
    ...tmplAdminNewApplicant({
      adminName: admin.name,
      tenantName: membership.tenant.name,
      applicantName: membership.name,
      level: membership.level,
      username: membership.user.username,
      email: membership.user.email,
      reviewLink,
    }),
    to: admin.user.email,
  });
}

/**
 * After a user verifies their email, promote any of their
 * PENDING_VERIFICATION memberships to PENDING and notify each tenant admin.
 */
export async function promoteVerifiedMemberships(userId: string): Promise<void> {
  const pending = await prisma.membership.findMany({
    where: { userId, status: MembershipStatus.PENDING_VERIFICATION },
  });
  for (const m of pending) {
    await prisma.membership.update({
      where: { id: m.id },
      data: { status: MembershipStatus.PENDING },
    });
    await notifyAdminOfApplication(m.id);
  }
}

/** Email the applicant the outcome of admin review (FR-1 AC#7). */
export async function sendApplicationResult(
  membershipId: string,
  approved: boolean,
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { tenant: true, user: true },
  });
  if (!membership) return;

  const link = approved
    ? `${env.appUrl}/t/${membership.tenant.slug}`
    : `${env.appUrl}/join`; // rejected users can re-apply (D2)
  await sendMail({
    ...tmplApplicationResult({
      name: membership.name,
      tenantName: membership.tenant.name,
      approved,
      link,
    }),
    to: membership.user.email,
  });
}
