import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinForm } from "@/components/forms/JoinForm";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusBadge } from "@/components/StatusBadge";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { MembershipStatus } from "@/lib/constants";

export default async function JoinPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const allTenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true },
  });
  const blocked = new Set(
    session.memberships
      .filter((m) => m.status !== MembershipStatus.REJECTED)
      .map((m) => m.tenantId),
  );
  const available = allTenants.filter((t) => !blocked.has(t.id));
  const approved = session.memberships.filter(
    (m) => m.status === MembershipStatus.APPROVED,
  );

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand)] text-base">
            🎬
          </span>
          <span className="font-bold text-slate-900">Film Room</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {approved.length > 0 && (
            <Link href={`/t/${approved[0].tenantSlug}`} className="btn-outline">
              進入社團
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

      <h1 className="text-xl font-bold text-slate-900">加入社團</h1>
      <p className="mt-1 text-sm text-slate-500">
        你好 {session.username}，可在此申請加入其他運動社團。
      </p>

      {session.memberships.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            我的申請狀態
          </h2>
          <ul className="card divide-y divide-slate-100">
            {session.memberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-800">{m.tenantName}</p>
                  <p className="text-xs text-slate-500">
                    {m.name}・{m.level}
                  </p>
                </div>
                <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          申請新的社團
        </h2>
        <div className="card p-5">
          <JoinForm tenants={available} />
        </div>
      </section>
    </main>
  );
}
