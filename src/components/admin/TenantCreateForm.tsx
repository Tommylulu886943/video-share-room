"use client";

import { MemberFields } from "@/components/forms/MemberFields";
import { MemberFieldEditor } from "@/components/admin/MemberFieldEditor";
import type { MemberField } from "@/lib/member-fields";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

export function TenantCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [brandLogo, setBrandLogo] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [memberFields, setMemberFields] = useState<MemberField[]>([]);
  const [adminAttributes, setAdminAttributes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setSlug("");
    setBrandColor("#2563eb");
    setBrandLogo("");
    setAdminUsername("");
    setAdminEmail("");
    setAdminPassword("");
    setAdminName("");
    setIsPrivate(false);
    setMemberFields([]);
    setAdminAttributes({});
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiPost("/api/admin/tenants", {
        name,
        slug,
        brandColor,
        brandLogo: brandLogo || undefined,
        adminUsername,
        adminEmail,
        adminPassword: adminPassword || undefined,
        adminName,
        isPrivate, memberFields, adminAttributes,
      });
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mb-6 p-4 sm:p-5">
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "✕ 收合" : "＋ 建立新社團"}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="t-name">
                社團名稱
              </label>
              <input
                id="t-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="t-slug">
                社團代稱（slug）
              </label>
              <input
                id="t-slug"
                className="input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-slate-500">小寫英數與 -</p>
            </div>
            <div>
              <label className="label" htmlFor="t-color">
                主色
              </label>
              <input
                id="t-color"
                type="color"
                className="input h-10"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="t-logo">
                Logo（emoji 或短字，選填）
              </label>
              <input
                id="t-logo"
                className="input"
                value={brandLogo}
                onChange={(e) => setBrandLogo(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
            <span>不公開社團<span className="mt-1 block text-xs text-slate-500">不會出現在註冊或申請清單；只有管理者邀請的成員可以加入。平台管理者仍可管理社團。</span></span>
          </label>
          <MemberFieldEditor fields={memberFields} onChange={fields => {
            setMemberFields(fields);
            setAdminAttributes(values => Object.fromEntries(fields.filter(f => f.id in values).map(f => [f.id, values[f.id]])));
          }} />
          <div className="border-t border-slate-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              指派管理者
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="a-username">
                  管理者帳號
                </label>
                <input
                  id="a-username"
                  className="input"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="a-email">
                  管理者 Email
                </label>
                <input
                  id="a-email"
                  type="email"
                  className="input"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="a-password">
                  管理者密碼
                </label>
                <input
                  id="a-password"
                  type="password"
                  className="input"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  若帳號已存在可留空
                </p>
              </div>
              <div>
                <label className="label" htmlFor="a-name">
                  管理者顯示名稱
                </label>
                <input
                  id="a-name"
                  className="input"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                />
              </div>

            </div>
          </div>

          <MemberFields fields={memberFields} values={adminAttributes} onChange={setAdminAttributes} prefix="admin" />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-brand" disabled={submitting}>
              {submitting ? "建立中…" : "建立社團"}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
