"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client";

export type TaxonomyPermissionItem = {
  id: string; name: string; visibility: string; accessMembershipIds: string[];
};
export type PermissionMember = { id: string; name: string; username: string };

export function TaxonomyPermissions({ slug, kind, item, members, inherited = false }: {
  slug: string; kind: "categories" | "tags"; item: TaxonomyPermissionItem;
  members: PermissionMember[]; inherited?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const selectableIds = new Set(members.map(m => m.id));
  const count = item.accessMembershipIds.filter(id => selectableIds.has(id)).length;

  async function save() {
    setBusy(true); setError("");
    try {
      await apiPatch(`/api/t/${slug}/${kind}/${item.id}/permissions`, {
        visibility: restricted ? "RESTRICTED" : "PUBLIC",
        accessMembershipIds: restricted ? selected : [],
      });
      setOpen(false); setSaved(true); router.refresh();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="mt-2 min-w-0 w-full text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">
        {item.visibility === "RESTRICTED" ? `🔒 指定會員（${count} 人）` : inherited ? "依大分類權限" : "不額外限制"}
      </span>
      <button type="button" className="btn-outline min-h-11" aria-label={`設定${item.name}可見權限`} aria-expanded={open} onClick={() => {
        if (open) { setOpen(false); return; }
        setRestricted(item.visibility === "RESTRICTED");
        setSelected(item.accessMembershipIds.filter(id => selectableIds.has(id)));
        setQuery(""); setError(""); setSaved(false); setOpen(true);
      }} disabled={busy}>可見權限</button>
      {saved && <span role="status" className="text-xs text-emerald-700">權限已儲存</span>}
    </div>
    {open && <fieldset disabled={busy} className="mt-3 min-w-0 space-y-3 rounded-lg bg-slate-50 p-3">
      <legend className="max-w-full break-words font-medium">{item.name}的可見權限</legend>
      <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2"><input type="radio" name={`visibility-${kind}-${item.id}`} className="size-5 shrink-0" checked={!restricted} onChange={() => setRestricted(false)} />{inherited ? "依大分類權限，不額外限制" : "不額外限制會員"}</label>
      <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2"><input type="radio" name={`visibility-${kind}-${item.id}`} className="size-5 shrink-0" checked={restricted} onChange={() => setRestricted(true)} />僅指定會員</label>
      <p className="text-xs text-slate-500">管理員一律可見。影片須同時符合分類、上層分類、所有標籤及影片本身的權限。</p>
      {restricted && <div className="space-y-2">
        <input className="input text-base sm:text-sm" aria-label="搜尋會員" placeholder="搜尋會員姓名或帳號" value={query} onChange={e => setQuery(e.target.value)} />
        <p className="text-xs text-slate-500">已選 {selected.length} 位；未選任何會員時，僅管理員可見。</p>
        <div className="max-h-52 space-y-2 overflow-y-auto">
          {members.filter(m => `${m.name} ${m.username}`.toLowerCase().includes(query.toLowerCase())).map(m => <label key={m.id} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2">
            <input type="checkbox" className="size-5 shrink-0" checked={selected.includes(m.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id))} />
            <span className="min-w-0 break-words">{m.name} <span className="text-xs text-slate-500">@{m.username}</span></span>
          </label>)}
          {!members.length && <p className="text-slate-500">尚無已核可會員。</p>}
        </div>
      </div>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-brand min-h-11 whitespace-nowrap" onClick={save}>{busy ? "儲存中…" : "儲存權限"}</button>
        <button type="button" className="btn-ghost min-h-11 whitespace-nowrap" onClick={() => setOpen(false)}>取消</button>
      </div>
    </fieldset>}
  </div>;
}
