"use client";

import { MemberFields } from "@/components/forms/MemberFields";
import { parseMemberFields } from "@/lib/member-fields";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

interface TenantOption {
  memberFields: string;
  slug: string;
  name: string;
}

export function JoinForm({ tenants }: { tenants: TenantOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    tenantSlug: tenants[0]?.slug ?? "",
    name: "",
    level: "",
  });
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  // After a successful join the refreshed `tenants` no longer contains the
  // club we just applied to; a stale slug would make the <select> show one
  // club while submitting another (→ 409 "你已是此社團成員").
  const tenantSlug = tenants.some((t) => t.slug === form.tenantSlug)
    ? form.tenantSlug
    : (tenants[0]?.slug ?? "");
  const fields = parseMemberFields(tenants.find(t => t.slug === tenantSlug)?.memberFields ?? "[]");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setLoading(true);
    try {
      const { status } = await apiPost<{ status: string }>(
        "/api/auth/join",
        { ...form, tenantSlug, attributes },
      );
      setMsg(
        status === "APPROVED"
          ? "已成功加入！可從上方「進入社團」開始觀看。"
          : status === "PENDING"
            ? "申請已送出，等待社團管理者審核。"
            : "申請已送出，請先完成 email 驗證（請查看信箱）。",
      );
      setForm((f) => ({ ...f, name: "", level: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "申請失敗");
    } finally {
      setLoading(false);
    }
  }

  if (tenants.length === 0) {
    return (
      <div className="space-y-3">
        {msg && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {msg}
          </p>
        )}
        <p className="text-sm text-slate-500">
          目前沒有其他可申請的社團。
        </p>
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
      {msg && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {msg}
        </p>
      )}
      <div>
        <label className="label" htmlFor="join-tenant">
          社團
        </label>
        <select
          id="join-tenant"
          className="input"
          value={tenantSlug}
          onChange={(e) => { set("tenantSlug", e.target.value); setAttributes({}); }}
        >
          {tenants.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="join-name">
          名稱
        </label>
        <input
          id="join-name"
          className="input"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={60}
          required
        />
      </div>
      <MemberFields fields={fields} values={attributes} onChange={setAttributes} />
      <button type="submit" className="btn-brand w-full" disabled={loading}>
        {loading ? "送出中…" : "送出申請"}
      </button>
    </form>
  );
}
