"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

export function AcceptInvitation() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <form className="card mt-6 space-y-3 p-5" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await apiPost<{ redirect: string }>("/api/auth/invitations/accept", { token });
      router.push(result.redirect); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "加入失敗"); }
    finally { setBusy(false); }
  }}>
    <label className="label" htmlFor="invitation-code">接受社團邀請</label>
    <p className="text-xs text-slate-500">請使用管理者指定的帳號登入，貼上邀請碼後即可加入。</p>
    <input id="invitation-code" className="input" value={token} onChange={e => setToken(e.target.value)} required autoComplete="off" maxLength={64} />
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button className="btn-brand" disabled={busy}>{busy ? "加入中…" : "接受邀請並加入"}</button>
  </form>;
}
