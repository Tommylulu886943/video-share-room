import Link from "next/link";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { UserMenu } from "@/components/UserMenu";

interface TenantInfo {
  slug: string;
  name: string;
  brandLogo: string | null;
}

export function TenantHeader({
  current,
  tenants,
  isAdmin,
  isSuperAdmin,
  username,
}: {
  current: TenantInfo;
  tenants: TenantInfo[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  username: string;
}) {
  return (
    <header
      className="sticky top-0 z-40 text-white shadow-sm"
      style={{ background: "var(--brand)" }}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-5">
        {/* Switcher sits top-left (FR-4 / D9). */}
        <TenantSwitcher current={current} tenants={tenants} />

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href={`/t/${current.slug}`}
            className="rounded-lg px-3 py-1.5 font-medium transition hover:bg-white/10"
          >
            影片
          </Link>
          {isAdmin && (
            <Link
              href={`/t/${current.slug}/admin`}
              className="rounded-lg px-3 py-1.5 font-medium transition hover:bg-white/10"
            >
              管理
            </Link>
          )}
          <div className="ml-1">
            <UserMenu username={username} isSuperAdmin={isSuperAdmin} />
          </div>
        </nav>
      </div>
    </header>
  );
}
