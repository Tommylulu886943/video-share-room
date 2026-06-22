import type { CSSProperties, ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { TenantHeader } from "@/components/TenantHeader";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { resolveTenantContext } from "@/lib/tenant";
import { landingPathFor } from "@/lib/nav";
import { MembershipStatus } from "@/lib/constants";

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await resolveTenantContext(slug, session);
  if (!ctx) notFound();
  if (!ctx.isMember) {
    // No access to this club — route the user to where they do belong.
    redirect(landingPathFor(session));
  }

  // Tenants the switcher may offer: super admins see all, others see their
  // approved clubs.
  const accessible = ctx.isSuperAdmin
    ? await prisma.tenant.findMany({
        orderBy: { createdAt: "asc" },
        select: { slug: true, name: true, brandLogo: true },
      })
    : session.memberships
        .filter((m) => m.status === MembershipStatus.APPROVED)
        .map((m) => ({
          slug: m.tenantSlug,
          name: m.tenantName,
          brandLogo: m.brandLogo,
        }));

  const current = {
    slug: ctx.tenant.slug,
    name: ctx.tenant.name,
    brandLogo: ctx.tenant.brandLogo,
  };

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ "--brand": ctx.tenant.brandColor } as CSSProperties}
    >
      <TenantHeader
        current={current}
        tenants={accessible}
        isAdmin={ctx.isAdmin}
        canUpload={ctx.canUpload}
        isSuperAdmin={ctx.isSuperAdmin}
        username={session.username}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
