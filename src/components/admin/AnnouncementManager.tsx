"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { ANNOUNCEMENT_COLORS, announcementColorStyles, type AnnouncementColor } from "@/lib/announcements";

type AnnouncementItem = {
  id: string;
  title: string;
  content: string;
  color: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  expired: boolean;
};

type FormState = { title: string; content: string; color: AnnouncementColor; expiresAt: string };
const emptyForm: FormState = { title: "", content: "", color: "blue", expiresAt: "" };

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function payload(form: FormState) {
  return {
    title: form.title,
    content: form.content,
    color: form.color,
    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
  };
}

export function AnnouncementManager({ slug, announcements }: { slug: string; announcements: AnnouncementItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  }

  function edit(item: AnnouncementItem) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      content: item.content,
      color: ANNOUNCEMENT_COLORS.includes(item.color as AnnouncementColor) ? item.color as AnnouncementColor : "blue",
      expiresAt: toLocalInput(item.expiresAt),
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!form.title.trim() || !form.content.trim()) {
      setError("請填寫公告標題與內容。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingId) await apiPatch(`/api/t/${slug}/announcements/${editingId}`, payload(form));
      else await apiPost(`/api/t/${slug}/announcements`, payload(form));
      reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: AnnouncementItem) {
    if (!confirm(`確定要刪除公告「${item.title}」嗎？`)) return;
    setError(null);
    try {
      await apiDelete(`/api/t/${slug}/announcements/${item.id}`);
      if (editingId === item.id) reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">公告管理</h1>
        <p className="mt-1 text-sm text-slate-500">公告會置頂顯示在社團影片牆；到期後會自動隱藏。</p>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <section className="card p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{editingId ? "編輯公告" : "新增公告"}</h2>
          {editingId ? <button type="button" className="btn-ghost" onClick={reset}>取消編輯</button> : null}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="announcement-title">公告標題</label>
            <input id="announcement-title" className="input" maxLength={100} value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="例如：本週日練習時間調整" />
          </div>
          <div>
            <label className="label" htmlFor="announcement-content">公告內容</label>
            <textarea id="announcement-content" className="input min-h-28 resize-y" maxLength={2000} value={form.content} onChange={(e) => update("content", e.target.value)} placeholder="輸入要讓所有社員知道的事項…" />
            <p className="mt-1 text-right text-xs text-slate-400">{form.content.length} / 2000</p>
          </div>
          <fieldset>
            <legend className="label">公告顏色</legend>
            <div className="flex flex-wrap gap-2">
              {ANNOUNCEMENT_COLORS.map((color) => {
                const style = announcementColorStyles[color];
                const selected = form.color === color;
                return (
                  <button key={color} type="button" onClick={() => update("color", color)} aria-pressed={selected} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${selected ? "border-slate-800 ring-2 ring-slate-300" : "border-slate-200 hover:border-slate-400"}`}>
                    <span className={`h-3 w-3 rounded-full ${style.dot}`} />{style.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="announcement-expiry">有效期限（選填）</label>
            <input id="announcement-expiry" type="datetime-local" className="input sm:max-w-sm" min={toLocalInput(new Date().toISOString())} value={form.expiresAt} onChange={(e) => update("expiresAt", e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">不設定代表持續顯示，直到管理員刪除。</p>
          </div>
          <div className={`min-w-0 rounded-xl border p-4 ${announcementColorStyles[form.color].panel}`}>
            <p className="text-xs font-medium opacity-60">預覽</p>
            <p className="mt-1 break-words font-semibold">📌 {form.title || "公告標題"}</p>
            <p className="mt-1 break-words whitespace-pre-wrap text-sm opacity-90">{form.content || "公告內容會顯示在這裡。"}</p>
          </div>
          <button type="button" className="btn-brand" disabled={busy} onClick={save}>{busy ? "儲存中…" : editingId ? "儲存變更" : "發布公告"}</button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">所有公告</h2>
        {announcements.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">目前尚無公告。</div> : null}
        {announcements.map((item) => {
          const color = ANNOUNCEMENT_COLORS.includes(item.color as AnnouncementColor) ? item.color as AnnouncementColor : "blue";
          const expired = item.expired;
          return (
            <article key={item.id} className={`rounded-xl border p-4 ${announcementColorStyles[color].panel} ${expired ? "opacity-60" : ""}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 break-words font-semibold">{item.title}</h3><span className={`chip ${expired ? "bg-slate-200 text-slate-600" : "bg-white/70 text-current"}`}>{expired ? "已到期" : "顯示中"}</span></div>
                  <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 opacity-90">{item.content}</p>
                  <p className="mt-2 text-xs opacity-60">{item.expiresAt ? `有效至 ${new Date(item.expiresAt).toLocaleString("zh-TW")}` : "無到期日"}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="btn-outline" onClick={() => edit(item)}>編輯</button>
                  <button type="button" className="btn-danger" onClick={() => remove(item)}>刪除</button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
