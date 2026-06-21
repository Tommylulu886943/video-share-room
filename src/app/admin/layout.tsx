import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PlatformRole } from "@/lib/constants";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.platformRole !== PlatformRole.SUPER_ADMIN) redirect("/");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-5">
          <span className="font-semibold">🎬 Film Room 平台管理</span>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-slate-200 hover:text-white">
              回首頁
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-5">
        {children}
      </main>
    </div>
  );
}
