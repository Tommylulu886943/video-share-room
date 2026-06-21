import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusBadge } from "@/components/StatusBadge";
import { getSession } from "@/lib/session";
import { MembershipStatus } from "@/lib/constants";
import { landingPathFor } from "@/lib/nav";

export default async function PendingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // If the user actually has access somewhere, send them there.
  const approved = session.memberships.filter(
    (m) => m.status === MembershipStatus.APPROVED,
  );
  if (approved.length > 0 || session.platformRole === "SUPER_ADMIN") {
    redirect(landingPathFor(session));
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-10">
      <div className="card w-full p-6 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-2xl">
          ⏳
        </span>
        <h1 className="text-lg font-bold text-slate-900">等待審核中</h1>
        <p className="mt-1 text-sm text-slate-500">
          你的申請已送出，社團管理者核可後即可觀看影片。核可結果會以 email 通知你。
        </p>

        {session.memberships.length > 0 && (
          <ul className="mt-5 space-y-2 text-left">
            {session.memberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="text-sm font-medium text-slate-700">
                  {m.tenantName}
                </span>
                <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex gap-2">
          <Link href="/join" className="btn-outline flex-1">
            申請其他社團
          </Link>
          <LogoutButton className="btn-ghost flex-1" />
        </div>
      </div>
    </main>
  );
}
