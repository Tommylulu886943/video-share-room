import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { RegisterForm } from "@/components/forms/RegisterForm";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { landingPathFor } from "@/lib/nav";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(landingPathFor(session));

  const { tenant } = await searchParams;
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: { slug: true, name: true },
  });

  return (
    <AuthLayout
      title="申請加入社團"
      subtitle="填寫資料後須完成 email 驗證，並等待社團管理者核可"
      footer={
        <>
          已經有帳號？{" "}
          <Link href="/login" className="font-semibold text-[var(--brand)]">
            前往登入
          </Link>
        </>
      }
    >
      {tenants.length === 0 ? (
        <p className="text-sm text-slate-500">
          目前還沒有開放的社團，請聯繫平台管理者。
        </p>
      ) : (
        <RegisterForm tenants={tenants} defaultSlug={tenant} />
      )}
    </AuthLayout>
  );
}
