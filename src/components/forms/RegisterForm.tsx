"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

interface TenantOption {
  slug: string;
  name: string;
}

type RegisterResult = {
  needsVerification: boolean;
  status: string;
  redirect?: string;
};

export function RegisterForm({
  tenants,
  defaultSlug,
}: {
  tenants: TenantOption[];
  defaultSlug?: string;
}) {
  const [form, setForm] = useState({
    tenantSlug: defaultSlug ?? tenants[0]?.slug ?? "",
    name: "",
    level: "",
    username: "",
    email: "",
    password: "",
  });
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<RegisterResult>("/api/auth/register", form);
      if (res.redirect) {
        // Auto-approved → already logged in; go straight to the club.
        router.push(res.redirect);
        router.refresh();
        return;
      }
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "申請失敗");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4 text-sm text-slate-600">
        <div className="rounded-lg bg-green-50 px-4 py-3 text-green-800">
          <p className="font-semibold">申請已送出！</p>
          {result.needsVerification ? (
            <p className="mt-1">
              我們已寄出一封驗證信到 <strong>{form.email}</strong>
              。請點擊信中連結完成 email 驗證。
            </p>
          ) : (
            <p className="mt-1">你的申請已送出，待社團管理者核可後即可登入觀看影片。</p>
          )}
        </div>
        <Link href="/login" className="btn-outline w-full">
          前往登入
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <label className="label" htmlFor="tenantSlug">
          欲加入的社團
        </label>
        <select
          id="tenantSlug"
          className="input"
          value={form.tenantSlug}
          onChange={(e) => set("tenantSlug", e.target.value)}
          required
        >
          {tenants.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="name">
            名稱
          </label>
          <input
            id="name"
            className="input"
            placeholder="隊友看到的稱呼"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="level">
            級數
          </label>
          <input
            id="level"
            className="input"
            placeholder="如：三段 / B 組"
            value={form.level}
            onChange={(e) => set("level", e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="username">
          帳號
        </label>
        <input
          id="username"
          className="input"
          autoComplete="username"
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          密碼
        </label>
        <input
          id="password"
          type="password"
          className="input"
          autoComplete="new-password"
          placeholder="至少 8 個字元"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          required
        />
      </div>
      <button type="submit" className="btn-brand w-full" disabled={loading}>
        {loading ? "送出中…" : "送出申請"}
      </button>
    </form>
  );
}
