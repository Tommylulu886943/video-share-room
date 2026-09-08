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
type ViewMode = "list" | "table";

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
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkForm, setBulkForm] = useState({
    applyCategory: false,
    categoryId: "",
    applyTags: false,
    tagMode: "add" as "add" | "remove" | "replace",
    tagIds: [] as string[],
  });

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

  function toggleVideo(id: string) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }

  function toggleAllVisible() {
    const visibleIds = visibleVideos.map((video) => video.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((ids) =>
      allSelected
        ? ids.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...ids, ...visibleIds])),
    );
  }

  function toggleBulkTag(id: string) {
    setBulkForm((form) => ({
      ...form,
      tagIds: form.tagIds.includes(id)
        ? form.tagIds.filter((tagId) => tagId !== id)
        : [...form.tagIds, id],
    }));
  }

  async function submitBulkEdit(e: React.FormEvent) {
    e.preventDefault();
    setBulkError(null);
    if (!bulkForm.applyCategory && !bulkForm.applyTags) {
      setBulkError("請至少勾選一項要修改的內容");
      return;
    }
    if (
      bulkForm.applyTags &&
      bulkForm.tagMode !== "replace" &&
      bulkForm.tagIds.length === 0
    ) {
      setBulkError("加入或移除標籤時，請至少選擇一個標籤");
      return;
    }
    setBulkSubmitting(true);
    try {
      await apiPatch(`/api/t/${slug}/videos/batch`, {
        videoIds: selectedIds,
        ...(bulkForm.applyCategory
          ? { categoryId: bulkForm.categoryId || null }
          : {}),
        ...(bulkForm.applyTags
          ? { tags: { mode: bulkForm.tagMode, tagIds: bulkForm.tagIds } }
          : {}),
      });
      setSelectedIds([]);
      setBulkOpen(false);
      setBulkForm({
        applyCategory: false,
        categoryId: "",
        applyTags: false,
        tagMode: "add",
        tagIds: [],
      });
      router.refresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "批次修改失敗");
    } finally {
      setBulkSubmitting(false);
    }
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
        <div className="space-y-3">
          {canManage && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <button type="button" className="btn-outline" onClick={toggleAllVisible}>
                {visibleVideos.length > 0 &&
                visibleVideos.every((video) => selectedIds.includes(video.id))
                  ? "取消選取目前結果"
                  : "選取目前結果"}
              </button>
              <span className="text-sm text-slate-500">
                已選 {selectedIds.length} 部
              </span>
              {selectedIds.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn-brand ml-auto"
                    onClick={() => setBulkOpen((value) => !value)}
                  >
                    批次修改
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setSelectedIds([]);
                      setBulkOpen(false);
                    }}
                  >
                    清除選取
                  </button>
                </>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2 lg:flex-row">
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
          <div
            className="grid grid-cols-2 rounded-lg border border-slate-300 bg-white p-1"
            role="group"
            aria-label="影片顯示方式"
          >
            <button
              type="button"
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={`flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${
                viewMode === "list"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <span aria-hidden>☰</span> 清單
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "table"}
              onClick={() => setViewMode("table")}
              className={`flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${
                viewMode === "table"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <span aria-hidden>▦</span> 表格
            </button>
          </div>
          </div>
        </div>
      )}

      {bulkOpen && selectedIds.length > 0 && (
        <form onSubmit={submitBulkEdit} className="card space-y-4 border-[var(--brand)] p-4">
          <div>
            <h2 className="font-semibold">批次修改 {selectedIds.length} 部影片</h2>
            <p className="mt-1 text-sm text-slate-500">
              只有勾選的項目會被套用；未勾選的資料會保持原樣。
            </p>
          </div>

          {bulkError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {bulkError}
            </p>
          )}

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={bulkForm.applyCategory}
                onChange={(e) =>
                  setBulkForm({ ...bulkForm, applyCategory: e.target.checked })
                }
              />
              統一分類
            </label>
            {bulkForm.applyCategory && (
              <select
                className="input mt-3"
                value={bulkForm.categoryId}
                onChange={(e) =>
                  setBulkForm({ ...bulkForm, categoryId: e.target.value })
                }
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
            )}
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={bulkForm.applyTags}
                onChange={(e) =>
                  setBulkForm({ ...bulkForm, applyTags: e.target.checked })
                }
              />
              統一標籤
            </label>
            {bulkForm.applyTags && (
              <div className="mt-3 space-y-3">
                <select
                  className="input sm:w-56"
                  value={bulkForm.tagMode}
                  onChange={(e) =>
                    setBulkForm({
                      ...bulkForm,
                      tagMode: e.target.value as "add" | "remove" | "replace",
                    })
                  }
                >
                  <option value="add">加入所選標籤</option>
                  <option value="remove">移除所選標籤</option>
                  <option value="replace">取代全部標籤</option>
                </select>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => {
                    const active = bulkForm.tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleBulkTag(tag.id)}
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
                  {allTags.length === 0 && (
                    <span className="text-sm text-slate-400">尚無標籤</span>
                  )}
                </div>
                {bulkForm.tagMode === "replace" && bulkForm.tagIds.length === 0 && (
                  <p className="text-xs text-amber-600">這會清除所選影片的全部標籤。</p>
                )}
              </div>
            )}
          </fieldset>

          <div className="flex gap-2">
            <button type="submit" className="btn-brand" disabled={bulkSubmitting}>
              {bulkSubmitting ? "套用中…" : `套用到 ${selectedIds.length} 部影片`}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setBulkOpen(false)}>
              取消
            </button>
          </div>
        </form>
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
              影片或網頁連結（YouTube / Bilibili / Instagram / 其他網站）
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
                  : "貼上影片或任意 HTTP(S) 網頁連結"
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
      ) : viewMode === "list" ? (
        <div className="space-y-3">
          {visibleVideos.map((v) => (
            <article
              key={v.id}
              className={`card flex overflow-hidden transition sm:min-h-36 ${
                selectedIds.includes(v.id) ? "ring-2 ring-[var(--brand)]" : ""
              }`}
            >
              {canManage && (
                <label className="grid w-11 shrink-0 cursor-pointer place-items-center border-r border-slate-100 bg-slate-50/70">
                  <input
                    type="checkbox"
                    aria-label={`選取 ${v.title}`}
                    checked={selectedIds.includes(v.id)}
                    onChange={() => toggleVideo(v.id)}
                    className="h-5 w-5 accent-[var(--brand)]"
                  />
                </label>
              )}
              <div className="hidden w-52 shrink-0 bg-slate-100 sm:block">
                {v.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.posterUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-slate-400">無縮圖</div>
                )}
              </div>
              <div className="min-w-0 flex-1 p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="line-clamp-2 font-semibold text-slate-900">{v.title}</h3>
                  <span className="shrink-0 text-xs text-slate-400">👁 {v.viewCount.toLocaleString()}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {v.categoryLabel && <span className="chip bg-slate-100 text-slate-600">{v.categoryLabel}</span>}
                  {v.tags.map((t) => <span key={t} className="chip bg-[var(--brand)]/10 text-[var(--brand)]">{t}</span>)}
                  {v.visibility === Visibility.RESTRICTED ? (
                    <span className="chip bg-amber-100 text-amber-700">🔒 受限（{v.accessCount} 人）</span>
                  ) : (
                    <span className="chip bg-emerald-100 text-emerald-700">全社團</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span>拍攝日期：{v.recordedOn ?? "未設定"}</span>
                  {canManage && (
                    <span className="ml-auto flex gap-2">
                      <button type="button" className="btn-outline !px-3 !py-1.5" onClick={() => startEdit(v)}>編輯</button>
                      <button type="button" className="btn-danger !px-3 !py-1.5" onClick={() => handleDelete(v.id)}>刪除</button>
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {canManage && (
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="選取目前結果"
                        checked={visibleVideos.every((video) => selectedIds.includes(video.id))}
                        onChange={toggleAllVisible}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">影片名稱</th>
                  <th className="px-4 py-3">拍攝日期</th>
                  <th className="px-4 py-3">分類／標籤</th>
                  <th className="px-4 py-3">權限</th>
                  <th className="px-4 py-3 text-right">觀看</th>
                  {canManage && <th className="px-4 py-3 text-right">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleVideos.map((v) => (
                  <tr key={v.id} className={selectedIds.includes(v.id) ? "bg-[var(--brand)]/5" : "hover:bg-slate-50/70"}>
                    {canManage && <td className="px-4 py-3"><input type="checkbox" aria-label={`選取 ${v.title}`} checked={selectedIds.includes(v.id)} onChange={() => toggleVideo(v.id)} className="h-4 w-4 accent-[var(--brand)]" /></td>}
                    <td className="max-w-xs px-4 py-3"><p className="line-clamp-2 font-medium text-slate-900">{v.title}</p></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{v.recordedOn ?? "未設定"}</td>
                    <td className="max-w-xs px-4 py-3"><div className="flex flex-wrap gap-1">{v.categoryLabel && <span className="chip bg-slate-100 text-slate-600">{v.categoryLabel}</span>}{v.tags.map((t) => <span key={t} className="chip bg-[var(--brand)]/10 text-[var(--brand)]">{t}</span>)}{!v.categoryLabel && v.tags.length === 0 && <span className="text-slate-400">—</span>}</div></td>
                    <td className="px-4 py-3">{v.visibility === Visibility.RESTRICTED ? <span className="chip bg-amber-100 text-amber-700">🔒 {v.accessCount} 人</span> : <span className="chip bg-emerald-100 text-emerald-700">全社團</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{v.viewCount.toLocaleString()}</td>
                    {canManage && <td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" className="btn-ghost !px-2.5 !py-1.5" onClick={() => startEdit(v)}>編輯</button><button type="button" className="btn-ghost !px-2.5 !py-1.5 text-red-600" onClick={() => handleDelete(v.id)}>刪除</button></div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {visibleVideos.map((v) => (
              <article key={v.id} className={`flex gap-3 p-3 ${selectedIds.includes(v.id) ? "bg-[var(--brand)]/5" : ""}`}>
                {canManage && <input type="checkbox" aria-label={`選取 ${v.title}`} checked={selectedIds.includes(v.id)} onChange={() => toggleVideo(v.id)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]" />}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900">{v.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{v.recordedOn ?? "未設定日期"} · 👁 {v.viewCount.toLocaleString()}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{v.categoryLabel && <span className="chip bg-slate-100 text-slate-600">{v.categoryLabel}</span>}{v.tags.map((t) => <span key={t} className="chip bg-[var(--brand)]/10 text-[var(--brand)]">{t}</span>)}{v.visibility === Visibility.RESTRICTED ? <span className="chip bg-amber-100 text-amber-700">🔒 受限</span> : <span className="chip bg-emerald-100 text-emerald-700">全社團</span>}</div>
                  {canManage && <div className="mt-3 flex gap-2"><button type="button" className="btn-outline !px-3 !py-1.5" onClick={() => startEdit(v)}>編輯</button><button type="button" className="btn-ghost !px-3 !py-1.5 text-red-600" onClick={() => handleDelete(v.id)}>刪除</button></div>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
