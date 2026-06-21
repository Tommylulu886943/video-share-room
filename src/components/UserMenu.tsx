"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

export function UserMenu({
  username,
  isSuperAdmin,
}: {
  username: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await apiPost("/api/auth/logout").catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-sm font-bold uppercase text-white transition hover:bg-white/25"
        aria-label="使用者選單"
      >
        {username.slice(0, 1)}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 text-slate-500">
            登入身分
            <div className="font-semibold text-slate-900">{username}</div>
          </div>
          <Link
            href="/join"
            className="block px-3 py-2.5 text-slate-700 hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            我的社團 / 加入社團
          </Link>
          {isSuperAdmin && (
            <Link
              href="/admin"
              className="block px-3 py-2.5 text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              平台管理
            </Link>
          )}
          <button
            onClick={logout}
            className="block w-full px-3 py-2.5 text-left text-red-600 hover:bg-red-50"
          >
            登出
          </button>
        </div>
      )}
    </div>
  );
}
