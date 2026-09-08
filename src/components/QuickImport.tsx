"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/client";
import { parseVideoRef } from "@/lib/sources";

const subscribe = () => () => {};
export function QuickImport({ userId, tenants, initialUrl, initialTitle }: {
  userId: string;
  tenants: { slug: string; name: string }[];
  initialUrl: string;
  initialTitle: string;
}) {
  const storageKey = `courtside:default-tenant:${userId}`;
  const saved = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  }, () => "");
  const [selected, setSelected] = useState<string | null>(null);
  const slug = selected ?? (tenants.some((t) => t.slug === saved) ? saved : tenants[0]?.slug ?? "");
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  if (!tenants.length) return <p role="status">目前沒有可匯入的社團，請聯絡社團管理者開啟上傳權限。</p>;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || result) return;
    setError("");
    if (!parseVideoRef(url)) { setError("請輸入有效的 HTTP(S) 網址或影片 ID"); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const video = await apiPost<{ id: string }>(`/api/t/${encodeURIComponent(slug)}/videos`, {
        youtube: url, title, visibility: "PUBLIC",
      });
      setResult(`/t/${encodeURIComponent(slug)}/video/${encodeURIComponent(video.id)}`);
      if (remember) {
        try { localStorage.setItem(storageKey, slug); } catch { setError("影片已匯入，但瀏覽器無法儲存預設社團。"); }
      }
    } catch (err) { setError(err instanceof Error ? err.message : "匯入失敗，請重試"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card space-y-5 p-5">
      <fieldset disabled={busy || Boolean(result)} className="space-y-5">
        <label className="block space-y-2"><span className="label">匯入社團（tenant）</span>
          <select className="input" value={slug} onChange={(e) => setSelected(e.target.value)}>
            {tenants.map((t) => <option key={t.slug} value={t.slug}>{t.name}{t.slug === saved ? "（預設）" : ""}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />將此次選擇設為預設社團</label>
        <label className="block space-y-2"><span className="label">網址</span><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={8192} /></label>
        <label className="block space-y-2"><span className="label">標題</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} /></label>
        <p className="text-sm text-slate-500">匯入後全社團可見，可在影片管理中調整分類與觀看權限。</p>
        <button className="btn-brand w-full" type="submit">{busy ? "匯入中…" : "確認匯入"}</button>
      </fieldset>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {result && <p role="status" className="text-green-700">匯入成功！ <Link className="underline" href={result}>查看內容 →</Link></p>}
    </form>
  );
}
