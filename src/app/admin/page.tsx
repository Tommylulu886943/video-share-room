import Link from "next/link";
import { prisma } from "@/lib/db";
import { MembershipStatus, TenantRole } from "@/lib/constants";
import { TenantCreateForm } from "@/components/admin/TenantCreateForm";

// Access is gated by src/app/admin/layout.tsx (super admin only).
export default async function AdminPage() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { memberships: true, videos: true } },
    },
  });

  const admins = await prisma.membership.findMany({
    where: { role: TenantRole.ADMIN, status: MembershipStatus.APPROVED },
    include: { user: true },
  });

  const adminByTenant = new Map<string, (typeof admins)[number]>();
  for (const m of admins) {
    if (!adminByTenant.has(m.tenantId)) adminByTenant.set(m.tenantId, m);
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800">社團管理</h1>

      <TenantCreateForm />

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">社團</th>
              <th className="px-4 py-3 font-medium">代稱</th>
              <th className="px-4 py-3 font-medium">管理者</th>
              <th className="px-4 py-3 font-medium">成員數</th>
              <th className="px-4 py-3 font-medium">影片數</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const admin = adminByTenant.get(t.id);
              return (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 shrink-0 rounded-full border border-slate-200"
                        style={{ backgroundColor: t.brandColor }}
                      />
                      {t.brandLogo && <span>{t.brandLogo}</span>}
                      <span className="font-medium text-slate-800">
                        {t.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t.slug}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {admin ? (
                      <span>
                        {admin.name}
                        <span className="text-slate-400">
                          {" "}
                          （{admin.user.username}）
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t._count.memberships}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t._count.videos}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={"/t/" + t.slug} className="btn-outline">
                      進入
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
