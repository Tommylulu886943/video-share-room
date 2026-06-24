"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface CatNode {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

export function BoardFilters({
  basePath,
  categories,
  tags,
  selected,
}: {
  basePath: string;
  categories: CatNode[];
  tags: { id: string; name: string }[];
  selected: { catId: string; tagIds: string[]; q: string };
}) {
  const router = useRouter();
  const [q, setQ] = useState(selected.q);
  // "" (show all) maps to the explicit "all" value in the dropdown/URL, so that
  // selecting 全部分類 overrides a configured default category.
  const [catId, setCatId] = useState(selected.catId || "all");
  const [tagIds, setTagIds] = useState<string[]>(selected.tagIds);

  function push(next: { q: string; catId: string; tagIds: string[] }) {
    const p = new URLSearchParams();
    if (next.q.trim()) p.set("q", next.q.trim());
    if (next.catId) p.set("cat", next.catId);
    next.tagIds.forEach((t) => p.append("tag", t));
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function selectCat(id: string) {
    setCatId(id);
    push({ q, catId: id, tagIds });
  }

  function toggleTag(id: string) {
    const next = tagIds.includes(id)
      ? tagIds.filter((x) => x !== id)
      : [...tagIds, id];
    setTagIds(next);
    push({ q, catId, tagIds: next });
  }

  function clearAll() {
    setQ("");
    setCatId("all");
    setTagIds([]);
    push({ q: "", catId: "all", tagIds: [] });
  }

  // Debounced keyword search.
  useEffect(() => {
    if (q === selected.q) return;
    const t = setTimeout(() => push({ q, catId, tagIds }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = Boolean(q || (catId && catId !== "all") || tagIds.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            className="input pl-9"
            placeholder="搜尋標題或備註…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input sm:w-56"
          value={catId}
          onChange={(e) => selectCat(e.target.value)}
        >
          <option value="all">全部分類</option>
          {categories.map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name}（全部）</option>
              {c.children.map((s) => (
                <option key={s.id} value={s.id}>
                  　└ {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                className={`chip border transition ${
                  on
                    ? "border-transparent bg-[var(--brand)] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                #{t.name}
              </button>
            );
          })}
          {hasFilters && (
            <button
              onClick={clearAll}
              className="chip border border-slate-200 bg-white text-slate-400 hover:text-slate-600"
            >
              ✕ 清除篩選
            </button>
          )}
        </div>
      )}
    </div>
  );
}
