import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { VerifyEmailButton } from "@/components/forms/VerifyEmailButton";
import { peekEmailVerifyToken } from "@/lib/tokens";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // Only validate here — do NOT consume on GET (link scanners/prefetch would
  // otherwise burn the single-use token before the user clicks).
  const valid = token ? (await peekEmailVerifyToken(token)) !== null : false;

  return (
    <AuthLayout title={valid ? "驗證你的 Email" : "驗證連結無效"}>
      {valid && token ? (
        <VerifyEmailButton token={token} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            這個驗證連結無效或已過期。若你已完成驗證，請直接登入；否則請重新申請以取得新的驗證信。
          </div>
          <div className="flex gap-2">
            <Link href="/login" className="btn-outline flex-1">
              登入
            </Link>
            <Link href="/register" className="btn-outline flex-1">
              重新申請
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
