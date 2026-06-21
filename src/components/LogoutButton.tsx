"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

export function LogoutButton({
  className = "btn-ghost",
  label = "登出",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await apiPost("/api/auth/logout");
      router.push("/login");
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <button onClick={logout} className={className} disabled={loading}>
      {loading ? "登出中…" : label}
    </button>
  );
}
