"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client";
import { Visibility } from "@/lib/constants";
import { videoWatchUrl, SOURCE_LABEL, type VideoSource } from "@/lib/sources";

type VideoItem = {
  id: string;
  title: string;
  source: string;
  youtubeId: string;
  posterUrl: string | null;
  thumbnailUrl: string | null;
  viewCount: number;
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
  thumbnailUrl: "",
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

  // List controls: keyword search, category filter, and sort. All client-side
  // so the admin can find a video instantly without a server round-trip.
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [sortBy, setSortBy] = useState("new");

  // `videos` arrives newest-first (createdAt desc), so the original order is the
  // "最新加入" sort. Everything else filters/reorders a copy.
  const visibleVideos = useMemo(() => {
    const term = query.trim().toLowerCase();

    const matchesCategory = (v: VideoItem) => {
      if (filterCat === "all") return true;
      if (filterCat === "none") return !v.categoryId;
      const top = categoryTree.find((c) => c.id === filterCat);
      if (top) {
        const ids = [top.id, ...top.children.map((c) => c.id)];
        return v.categoryId != null && ids.includes(v.categoryId);
      }
      return v.categoryId === filterCat;
    };

    const matchesQuery = (v: VideoItem) =>
      !term ||
      v.title.toLowerCase().includes(term) ||
      (v.notes ?? "").toLowerCase().includes(term) ||
      v.tags.some((t) => t.toLowerCase().includes(term));

    const list = videos.filter((v) => matchesCategory(v) && matchesQuery(v));

    const byDate = (dir: 1 | -1) => (a: VideoItem, b: VideoItem) => {
      const ak = a.recordedOn ?? "";
      const bk = b.recordedOn ?? "";
      if (ak === bk) return 0;
      if (!ak) return 1; // videos without a date sort last
      if (!bk) return -1;
      return dir * ak.localeCompare(bk);
    };

    switch (sortBy) {
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
        break;
      case "views":
        list.sort((a, b) => b.viewCount - a.viewCount);
        break;
      case "date_desc":
        list.sort(byDate(-1));
        break;
      case "date_asc":
        list.sort(byDate(1));
        break;
      default:
        break; // "new" → keep original (newest-first) order
    }
    return list;
  }, [videos, query, filterCat, sortBy, categoryTree]);

  const filtersActive =
    query.trim() !== "" || filterCat !== "all" || sortBy !== "new";

  function clearFilters() {
    setQuery("");
    setFilterCat("all");
    setSortBy("new");
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  }

  function closeModal() {
    resetForm();
    setOpen(false);
  }

  function startCreate() {
    resetForm();
    setOpen(true);
  }

  // While the modal is open: close on Escape and lock background scroll so the
  // list keeps its position.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        resetForm();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function startEdit(v: VideoItem) {
    setForm({
      title: v.title,
      // Leave the link blank: blank means "keep the existing video". Pre-filling
      // the bare stored id would re-run it through the URL parser on save, which
      // can mis-detect the source (e.g. an 11-char Instagram shortcode looks like
      // a YouTube id) or fail outright. The admin only fills this to *replace* it.
      youtube: "",
      thumbnailUrl: v.thumbnailUrl ?? "",
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
      thumbnailUrl: form.thumbnailUrl,
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

  const editing = editingId ? (videos.find((v) => v.id === editingId) ?? null) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {visibleVideos.length === videos.length
            ? `共 ${videos.length} 部影片`
            : `顯示 ${visibleVideos.length}／共 ${videos.length} 部影片`}
        </p>
        <button type="button" className="btn-brand" onClick={startCreate}>
          ＋ 新增影片
        </button>
      </div>

      {videos.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              🔍
            </span>
            <input
              className="input pl-9"
              placeholder="搜尋標題、備註或標籤…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="input sm:w-56"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            aria-label="分類篩選"
          >
            <option value="all">全部分類</option>
            <option value="none">未分類</option>
            {categoryTree.map((top) => (
              <optgroup key={top.id} label={top.name}>
                <option value={top.id}>全部</option>
                {top.children.map((c) => (
                  <option key={c.id} value={c.id}>
                    　└ {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            className="input sm:w-40"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="排序"
          >
            <option value="new">最新加入</option>
            <option value="title">名稱</option>
            <option value="date_desc">日期（新→舊）</option>
            <option value="date_asc">日期（舊→新）</option>
            <option value="views">觀看次數</option>
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="btn-ghost shrink-0"
            >
              ✕ 清除
            </button>
          )}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          onClick={closeModal}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="card my-8 w-full max-w-2xl space-y-4 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? "編輯影片" : "新增影片"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="關閉"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

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
            {editing && (
              <p className="text-xs text-slate-500">
                目前來源：
                {SOURCE_LABEL[editing.source as VideoSource] ?? editing.source}・
                <a
                  href={videoWatchUrl(editing.source, editing.youtubeId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--brand)] underline"
                >
                  開啟原連結
                </a>
              </p>
            )}
            <input
              id="vm-youtube"
              className="input"
              value={form.youtube}
              onChange={(e) => setForm({ ...form, youtube: e.target.value })}
              placeholder={
                editing
                  ? "留空＝維持原影片；貼上新連結才會更換"
                  : "貼上 YouTube / Bilibili / Instagram Reel 連結"
              }
              required={!editing}
            />
            {editing && (
              <p className="text-xs text-slate-400">
                只是要改標題、分類、標籤等資訊時，請保持空白。
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="label" htmlFor="vm-thumb">
              封面圖網址（選填）
            </label>
            <input
              id="vm-thumb"
              className="input"
              value={form.thumbnailUrl}
              onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
              placeholder="https://…/cover.jpg"
            />
            <p className="text-xs text-slate-500">
              Instagram 影片建議填(影片牆縮圖用);留空時 YouTube／Bilibili 會自動取得封面。
            </p>
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
              <button type="button" className="btn-ghost" onClick={closeModal}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {videos.length === 0 ? (
        <p className="text-sm text-slate-400">尚無影片，點擊「＋ 新增影片」開始。</p>
      ) : visibleVideos.length === 0 ? (
        <div className="card grid place-items-center px-6 py-12 text-center">
          <span className="mb-2 text-3xl">🔍</span>
          <p className="font-medium text-slate-700">沒有符合條件的影片</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-sm text-[var(--brand)] hover:underline"
          >
            清除篩選條件
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleVideos.map((v) => (
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
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{v.title}</h3>
                  <span className="shrink-0 text-xs text-slate-400">
                    👁 {v.viewCount.toLocaleString()}
                  </span>
                </div>
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
