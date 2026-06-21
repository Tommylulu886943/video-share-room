import { MembershipStatus, PlatformRole } from "@/lib/constants";
import type { SessionUser } from "@/lib/session";

/** Where a freshly-authenticated user should land based on their memberships. */
export function landingPathFor(user: SessionUser): string {
  const approved = user.memberships.filter(
    (m) => m.status === MembershipStatus.APPROVED,
  );

  if (user.platformRole === PlatformRole.SUPER_ADMIN) {
    // Super admins manage the platform; if they only run one club, drop them in it.
    if (approved.length === 1) return `/t/${approved[0].tenantSlug}`;
    return "/admin";
  }

  if (approved.length >= 1) return `/t/${approved[0].tenantSlug}`;

  const hasPending = user.memberships.some(
    (m) =>
      m.status === MembershipStatus.PENDING ||
      m.status === MembershipStatus.PENDING_VERIFICATION,
  );
  return hasPending ? "/pending" : "/join";
}
