import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { PlatformRole, TenantRole } from "@/lib/constants";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      memberships: { include: { tenant: true }, orderBy: { appliedAt: "asc" } },
    },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">使用者管理</h1>
      <p className="mb-4 text-sm text-slate-500">共 {users.length} 位使用者</p>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">帳號</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">平台角色</th>
              <th className="px-4 py-3 font-medium">Email 驗證</th>
              <th className="px-4 py-3 font-medium">社團 / 身分 / 狀態</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-slate-100 align-top last:border-0"
              >
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.username}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  {u.platformRole === PlatformRole.SUPER_ADMIN ? (
                    <span className="chip bg-purple-100 text-purple-700">
                      平台管理員
                    </span>
                  ) : (
                    <span className="text-slate-400">一般</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.emailVerified ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.memberships.length === 0 ? (
                    <span className="text-slate-400">（無）</span>
                  ) : (
                    <ul className="space-y-1">
                      {u.memberships.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-slate-700">
                            {m.tenant.name}
                          </span>
                          {m.role === TenantRole.ADMIN && (
                            <span className="chip bg-blue-100 text-blue-700">
                              管理者
                            </span>
                          )}
                          <span className="text-slate-400">{m.name}</span>
                          <StatusBadge status={m.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
