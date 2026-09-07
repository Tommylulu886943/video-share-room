"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiPatch } from "@/lib/client";
import type { MemberField } from "@/lib/member-fields";
import { MemberFields } from "@/components/forms/MemberFields";

export function MemberActions({ slug, member, fields }: {
  slug: string;
  member: { id: string; name: string; username: string; attributes: Record<string, string> };
  fields: MemberField[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [attributes, setAttributes] = useState(member.attributes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPatch(`/api/t/${slug}/members/${member.id}`, { name, attributes });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失敗");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`確定要將「${member.name}」（${member.username}）踢出社團嗎？\n\n對方的登入帳戶不會被刪除，但將失去此社團的存取權限。`)) return;
    setBusy(true);
    setError("");
    try {
      await apiDelete(`/api/t/${slug}/members/${member.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "踢除失敗");
      setBusy(false);
    }
  }

  return <>
    <div className="flex items-center gap-1">
      <button type="button" className="btn-ghost px-2.5 py-1.5" disabled={busy} onClick={() => setEditing(true)}>編輯</button>
      <button type="button" className="btn-ghost px-2.5 py-1.5 text-red-600 hover:bg-red-50" disabled={busy} onClick={remove}>踢除</button>
    </div>
    {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !busy) setEditing(false);
    }}>
      <form className="card max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto p-5" role="dialog" aria-modal="true" aria-labelledby={`edit-member-${member.id}`} onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div>
          <h3 id={`edit-member-${member.id}`} className="text-lg font-semibold">編輯成員</h3>
          <p className="text-sm text-slate-500">帳號：{member.username}</p>
        </div>
        <label className="label">成員顯示名稱
          <input className="input mt-1" value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <MemberFields fields={fields} values={attributes} onChange={setAttributes} prefix={`edit-${member.id}`} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" disabled={busy} onClick={() => setEditing(false)}>取消</button>
          <button className="btn-brand" disabled={busy}>{busy ? "儲存中…" : "儲存變更"}</button>
        </div>
      </form>
    </div>}
  </>;
}
