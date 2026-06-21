"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/client";

export function VerifyEmailButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setState("loading");
    setError(null);
    try {
      await apiPost("/api/auth/verify-email", { token });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "驗證失敗");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          你的 email 已成功驗證，申請已送交社團管理者審核。核可後你就能登入觀看影片。
        </div>
        <Link href="/login" className="btn-brand w-full">
          前往登入
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">點擊下方按鈕完成 email 驗證。</p>
      <button
        onClick={verify}
        className="btn-brand w-full"
        disabled={state === "loading"}
      >
        {state === "loading" ? "驗證中…" : "完成驗證"}
      </button>
    </div>
  );
}
