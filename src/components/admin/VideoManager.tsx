"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client";
import { Visibility } from "@/lib/constants";

type VideoItem = {
  id: string;
  title: string;
  youtubeId: string;
  posterUrl: string | null;
  visibility: string;
  categoryId: string | null;
  categoryLabel: string | null;
  notes: string | null;
  tags: string[];
  tagIds: string[];
  accessMembershipIds: string[];
  accessCount: number;
  recordedOn: string | null;
};

type CategoryNode = {
  id: string;
  name: string;
  children: { id: string; name: string }[];
};

type TagItem = { id: string; name: string };
type MemberItem = { id: string; name: string; level: string };

type Props = {
  slug: string;
  videos: VideoItem[];
  categoryTree: CategoryNode[];
  allTags: TagItem[];
  members: MemberItem[];
  /** false = contributor view: can add, but no edit/delete of existing videos. */
  canManage?: boolean;
};

const emptyForm = {
  title: "",
  youtube: "",
  catId: "",
  tagIds: [] as string[],
  visibility: Visibility.PUBLIC as string,
  recordedOn: "",
  notes: "",
  accessMembershipIds: [] as string[],
};

export function VideoManager({
  slug,
  videos,
  categoryTree,
  allTags,
  members,
  canManage = true,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  }

  function startCreate() {
    resetForm();
    setOpen(true);
  }

  function startEdit(v: VideoItem) {
    setForm({
      title: v.title,
      youtube: v.youtubeId,
      catId: v.categoryId ?? "",
      tagIds: [...v.tagIds],
      visibility: v.visibility,
      recordedOn: v.recordedOn ?? "",
      notes: v.notes ?? "",
      accessMembershipIds: [...v.accessMembershipIds],
    });
    setEditingId(v.id);
    setError(null);
    setOpen(true);
  }

  function toggleTag(id: string) {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(id)
        ? f.tagIds.filter((t) => t !== id)
        : [...f.tagIds, id],
    }));
  }

  function toggleAccess(id: string) {
    setForm((f) => ({
      ...f,
      accessMembershipIds: f.accessMembershipIds.includes(id)
        ? f.accessMembershipIds.filter((m) => m !== id)
        : [...f.accessMembershipIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const body = {
      title: form.title,
      youtube: form.youtube,
      notes: form.notes,
      recordedOn: form.recordedOn || null,
      categoryId: form.catId || null,
      tagIds: form.tagIds,
      visibility: form.visibility,
      accessMembershipIds:
        form.visibility === Visibility.RESTRICTED
          ? form.accessMembershipIds
          : [],
    };
    try {
      if (editingId) {
        await apiPatch("/api/t/" + slug + "/videos/" + editingId, body);
      } else {
        await apiPost("/api/t/" + slug + "/videos", body);
      }
      resetForm();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生未知錯誤");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除此影片嗎？此動作無法復原。")) return;
    try {
      await apiDelete("/api/t/" + slug + "/videos/" + id);
      if (editingId === id) {
        resetForm();
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生未知錯誤");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">共 {videos.length} 部影片</p>
        <button
          type="button"
          className="btn-brand"
          onClick={() => {
            if (open && !editingId) {
              setOpen(false);
              resetForm();
            } else {
              startCreate();
            }
          }}
        >
          ＋ 新增影片
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="card space-y-4 p-4">
          <h2 className="text-lg font-semibold">
            {editingId ? "編輯影片" : "新增影片"}
          </h2>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="space-y-1">
            <label className="label" htmlFor="vm-title">
              標題
            </label>
            <input
              id="vm-title"
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="留空則自動使用 YouTube 影片標題"
            />
          </div>

          <div className="space-y-1">
            <label className="label" htmlFor="vm-youtube">
              影片連結（YouTube / Bilibili / Instagram）
            </label>
            <input
              id="vm-youtube"
              className="input"
              value={form.youtube}
              onChange={(e) => setForm({ ...form, youtube: e.target.value })}
              placeholder="貼上 YouTube / Bilibili / Instagram Reel 連結"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="label" htmlFor="vm-category">
              分類
            </label>
            <select
              id="vm-category"
              className="input"
              value={form.catId}
              onChange={(e) => setForm({ ...form, catId: e.target.value })}
            >
              <option value="">未分類</option>
              {categoryTree.map((top) => (
                <optgroup key={top.id} label={top.name}>
                  <option value={top.id}>{top.name}</option>
                  {top.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      　{child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <span className="label">標籤</span>
            {allTags.length === 0 ? (
              <p className="text-sm text-slate-400">尚無標籤</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                  const active = form.tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={
                        active
                          ? "chip bg-[var(--brand)] text-white"
                          : "chip bg-slate-100 text-slate-600"
                      }
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <span className="label">可見性</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, visibility: Visibility.PUBLIC })
                }
                className={
                  form.visibility === Visibility.PUBLIC
                    ? "btn-brand"
                    : "btn-outline"
                }
              >
                全社團可見
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, visibility: Visibility.RESTRICTED })
                }
                className={
                  form.visibility === Visibility.RESTRICTED
                    ? "btn-brand"
                    : "btn-outline"
                }
              >
                受限
              </button>
            </div>
          </div>

          {form.visibility === Visibility.RESTRICTED && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="label">授權名單</span>
              <p className="text-xs text-slate-500">
                未被勾選的成員將完全看不到此影片。
              </p>
              {members.length === 0 ? (
                <p className="text-sm text-slate-400">尚無已核准的成員</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.accessMembershipIds.includes(m.id)}
                        onChange={() => toggleAccess(m.id)}
                      />
                      <span>
                        {m.name}・{m.level}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="label" htmlFor="vm-recorded">
              拍攝日期
            </label>
            <input
              id="vm-recorded"
              type="date"
              className="input"
              value={form.recordedOn}
              onChange={(e) =>
                setForm({ ...form, recordedOn: e.target.value })
              }
            />
          </div>

          <div className="space-y-1">
            <label className="label" htmlFor="vm-notes">
              備註
            </label>
            <textarea
              id="vm-notes"
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-brand" disabled={submitting}>
              {submitting ? "儲存中…" : editingId ? "更新影片" : "新增影片"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}

      {videos.length === 0 ? (
        <p className="text-sm text-slate-400">尚無影片，點擊「＋ 新增影片」開始。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {videos.map((v) => (
            <div key={v.id} className="card overflow-hidden">
              {v.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.posterUrl}
                  alt={v.title}
                  referrerPolicy="no-referrer"
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="grid aspect-video w-full place-items-center bg-slate-200 text-xs text-slate-500">
                  無縮圖
                </div>
              )}
              <div className="space-y-2 p-3">
                <h3 className="font-semibold">{v.title}</h3>
                <div className="flex flex-wrap gap-1">
                  {v.categoryLabel && (
                    <span className="chip bg-slate-100 text-slate-600">
                      {v.categoryLabel}
                    </span>
                  )}
                  {v.tags.map((t) => (
                    <span
                      key={t}
                      className="chip bg-[var(--brand)]/10 text-[var(--brand)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div>
                  {v.visibility === Visibility.RESTRICTED ? (
                    <span className="chip bg-amber-100 text-amber-700">
                      🔒受限（{v.accessCount} 人）
                    </span>
                  ) : (
                    <span className="chip bg-emerald-100 text-emerald-700">
                      全社團
                    </span>
                  )}
                </div>
                {v.recordedOn && (
                  <p className="text-xs text-slate-400">
                    拍攝日期：{v.recordedOn}
                  </p>
                )}
                {canManage && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => startEdit(v)}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => handleDelete(v.id)}
                    >
                      刪除
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
