"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import type { MemberField } from "@/lib/member-fields";
import { MemberFields } from "@/components/forms/MemberFields";

export function InviteMember({ slug, fields }: { slug: string; fields: MemberField[] }) {
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <form className="card space-y-4 p-5" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(""); setToken("");
    try {
      const result = await apiPost<{ token: string }>(`/api/t/${slug}/invitations`, { identifier, name, attributes });
      setToken(result.token); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "邀請失敗"); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-lg font-semibold">邀請成員</h2>
    <p className="text-sm text-slate-500">指定已註冊帳號並填寫成員資料。邀請碼有效 7 天、限該帳號使用一次；重新邀請會使舊碼失效。</p>
    <label className="label">帳號或 Email<input className="input mt-1" value={identifier} onChange={e => setIdentifier(e.target.value)} required /></label>
    <label className="label">成員顯示名稱<input className="input mt-1" value={name} onChange={e => setName(e.target.value)} maxLength={60} required /></label>
    <MemberFields fields={fields} values={attributes} onChange={setAttributes} prefix="invite" />
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button className="btn-brand" disabled={busy}>{busy ? "產生中…" : "產生邀請碼"}</button>
    {token && <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
      <p>請私下將此邀請碼交給受邀者，讓他登入後在「加入社團」接受邀請。</p>
      <input className="input font-mono" aria-label="邀請碼" readOnly value={token} onFocus={e => e.target.select()} />
    </div>}
  </form>;
}
