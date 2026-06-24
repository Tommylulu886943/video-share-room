"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client";

type CategoryNode = {
  id: string;
  name: string;
  children: { id: string; name: string }[];
};

export function DefaultCategoryForm({
  slug,
  categories,
  current,
}: {
  slug: string;
  categories: CategoryNode[];
  current: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onChange(next: string) {
    setValue(next);
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      await apiPatch("/api/t/" + slug + "/settings", { defaultCategoryId: next });
      setMsg("已儲存");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-semibold text-slate-900">預設分類</h2>
      <p className="mt-1 text-sm text-slate-500">
        成員進到影片牆時,自動先篩選到這個分類(可隨時在影片牆改選「全部分類」)。
      </p>
      <select
        className="input mt-3 sm:w-72"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
      >
        <option value="">不指定(顯示全部分類)</option>
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
      {(msg || error || saving) && (
        <p className={`mt-2 text-sm ${error ? "text-red-600" : "text-slate-500"}`}>
          {saving ? "儲存中…" : error ?? msg}
        </p>
      )}
    </div>
  );
}
