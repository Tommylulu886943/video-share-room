"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import { Visibility } from "@/lib/constants";

type CategoryNode = {
  id: string;
  name: string;
  children: { id: string; name: string }[];
};
type TagItem = { id: string; name: string };
type MemberItem = { id: string; name: string; level: string };

export function BatchUpload({
  slug,
  categoryTree,
  allTags,
  members,
}: {
  slug: string;
  categoryTree: CategoryNode[];
  allTags: TagItem[];
  members: MemberItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [catId, setCatId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<string>(Visibility.PUBLIC);
  const [accessIds, setAccessIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    failed: { input: string; reason: string }[];
  } | null>(null);

  const lines = useMemo(
    () => text.split("\n").map((l) => l.trim()).filter(Boolean),
    [text],
  );

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const data = await apiPost<{
        created: number;
        failed: { input: string; reason: string }[];
      }>("/api/t/" + slug + "/videos/batch", {
        items: lines,
        categoryId: catId || null,
        tagIds,
        visibility,
        accessMembershipIds:
          visibility === Visibility.RESTRICTED ? accessIds : [],
      });
      setResult(data);
      if (data.created > 0) {
        // Keep only the failed lines in the box for easy retry.
        setText(data.failed.map((f) => f.input).join("\n"));
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量上傳失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-4">
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "✕ 收合批量上傳" : "⬆️ 批量上傳（多部影片）"}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1">
            <label className="label" htmlFor="batch-text">
              影片連結 YouTube / Bilibili / Instagram（每行一個，最多 50 部）
            </label>
            <textarea
              id="batch-text"
              className="input font-mono text-xs"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"https://youtu.be/xxxxxxxxxxx\nhttps://www.bilibili.com/video/BVxxxxxxxxxx"}
            />
            <p className="text-xs text-slate-500">
              已輸入 {lines.length} 個・標題會自動帶入各影片的標題。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="label" htmlFor="batch-cat">
                共用分類
              </label>
              <select
                id="batch-cat"
                className="input"
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
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
              <span className="label">共用可見性</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility(Visibility.PUBLIC)}
                  className={
                    visibility === Visibility.PUBLIC ? "btn-brand" : "btn-outline"
                  }
                >
                  全社團可見
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility(Visibility.RESTRICTED)}
                  className={
                    visibility === Visibility.RESTRICTED
                      ? "btn-brand"
                      : "btn-outline"
                  }
                >
                  受限
                </button>
              </div>
            </div>
          </div>

          {allTags.length > 0 && (
            <div className="space-y-1">
              <span className="label">共用標籤</span>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                  const active = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setTagIds((l) => toggle(l, tag.id))}
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
            </div>
          )}

          {visibility === Visibility.RESTRICTED && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="label">共用授權名單</span>
              <p className="text-xs text-slate-500">
                未被勾選的成員將完全看不到這些影片。
              </p>
              {members.length === 0 ? (
                <p className="text-sm text-slate-400">尚無已核准的成員</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={accessIds.includes(m.id)}
                        onChange={() => setAccessIds((l) => toggle(l, m.id))}
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

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          {result && (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              已新增 {result.created} 部影片。
              {result.failed.length > 0 && (
                <div className="mt-1 text-amber-700">
                  {result.failed.length} 筆未處理（已保留在上方框內）：
                  <ul className="ml-4 list-disc">
                    {result.failed.slice(0, 5).map((f, i) => (
                      <li key={i} className="break-all">
                        {f.input} — {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn-brand"
            disabled={submitting || lines.length === 0}
          >
            {submitting
              ? "上傳中…"
              : `批量上傳 ${lines.length} 部影片`}
          </button>
        </form>
      )}
    </div>
  );
}
