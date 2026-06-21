import { pageTenantContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { MembershipStatus, TenantRole } from "@/lib/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { MemberReview } from "@/components/admin/MemberReview";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });

  const pending = await prisma.membership.findMany({
    where: { tenantId: ctx.tenant.id, status: MembershipStatus.PENDING },
    include: { user: true },
    orderBy: { appliedAt: "asc" },
  });

  const roster = await prisma.membership.findMany({
    where: {
      tenantId: ctx.tenant.id,
      status: { in: [MembershipStatus.APPROVED, MembershipStatus.REJECTED] },
    },
    include: { user: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">待審核申請 ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">目前沒有待審核的申請。</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pending.map((m) => (
              <div key={m.id} className="card flex flex-col gap-3 p-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-500">名稱</dt>
                  <dd className="font-medium">{m.name}</dd>
                  <dt className="text-slate-500">級數</dt>
                  <dd>{m.level}</dd>
                  <dt className="text-slate-500">帳號</dt>
                  <dd>{m.user.username}</dd>
                  <dt className="text-slate-500">Email</dt>
                  <dd>{m.user.email}</dd>
                  <dt className="text-slate-500">申請時間</dt>
                  <dd>
                    {m.appliedAt
                      ? m.appliedAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </dd>
                </dl>
                <MemberReview slug={slug} membershipId={m.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">社團成員</h2>
        {roster.length === 0 ? (
          <p className="text-sm text-slate-500">目前沒有成員。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-4 font-medium">名稱</th>
                  <th className="py-2 pr-4 font-medium">級數</th>
                  <th className="py-2 pr-4 font-medium">帳號</th>
                  <th className="py-2 pr-4 font-medium">角色</th>
                  <th className="py-2 pr-4 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((m) => (
                  <tr key={m.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{m.name}</td>
                    <td className="py-2 pr-4">{m.level}</td>
                    <td className="py-2 pr-4">{m.user.username}</td>
                    <td className="py-2 pr-4">
                      {m.role === TenantRole.ADMIN ? "管理者" : "成員"}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
