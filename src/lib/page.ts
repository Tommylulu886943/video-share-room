import { notFound, redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/session";
import { resolveTenantContext, type TenantContext } from "@/lib/tenant";
import { landingPathFor } from "@/lib/nav";

/**
 * Resolve a tenant context for a server component page, redirecting/404ing
 * when the viewer lacks access. Defense-in-depth alongside the layout guard.
 */
export async function pageTenantContext(
  slug: string,
  opts: { admin?: boolean; upload?: boolean } = {},
): Promise<{ session: SessionUser; ctx: TenantContext }> {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await resolveTenantContext(slug, session);
  if (!ctx) notFound();

  if (opts.admin) {
    if (!ctx.isAdmin) redirect(`/t/${slug}`);
  } else if (opts.upload) {
    if (!ctx.canUpload) redirect(`/t/${slug}`);
  } else if (!ctx.isMember) {
    redirect(landingPathFor(session));
  }

  return { session, ctx };
}
