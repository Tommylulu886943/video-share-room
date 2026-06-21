import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "@/components/forms/LoginForm";
import { getSession } from "@/lib/session";
import { landingPathFor } from "@/lib/nav";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(landingPathFor(session));

  return (
    <AuthLayout
      title="登入"
      subtitle="輸入帳號密碼進入你的社團影片室"
      footer={
        <>
          還沒有帳號？{" "}
          <Link href="/register" className="font-semibold text-[var(--brand)]">
            申請加入社團
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
