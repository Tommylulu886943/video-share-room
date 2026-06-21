"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client";

export function BrandingForm({
  slug,
  initial,
}: {
  slug: string;
  initial: { name: string; brandColor: string; brandLogo: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [brandColor, setBrandColor] = useState(initial.brandColor);
  const [brandLogo, setBrandLogo] = useState(initial.brandLogo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await apiPatch("/api/t/" + slug + "/branding", {
        name,
        brandColor,
        brandLogo: brandLogo || null,
      });
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <label className="label" htmlFor="brand-name">
          社團名稱
        </label>
        <input
          id="brand-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="label" htmlFor="brand-color">
          主色
        </label>
        <div className="flex items-center gap-3">
          <input
            id="brand-color"
            type="color"
            className="h-10 w-14 cursor-pointer rounded border border-slate-300"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
          />
          <input
            className="input flex-1"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            placeholder="#RRGGBB"
            maxLength={7}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="label" htmlFor="brand-logo">
          Logo 標記
        </label>
        <input
          id="brand-logo"
          className="input"
          value={brandLogo}
          onChange={(e) => setBrandLogo(e.target.value)}
          maxLength={8}
        />
        <p className="text-sm text-slate-500">可用一個 emoji 或短字，如 🥋</p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="label">預覽</span>
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-sm"
          style={{ background: brandColor }}
        >
          <span className="text-2xl leading-none">{brandLogo || "🥋"}</span>
          <span className="text-lg font-semibold">{name || "社團名稱"}</span>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}
      {success ? (
        <p className="text-sm text-green-600">已儲存品牌設定。</p>
      ) : null}

      <div>
        <button type="submit" className="btn-brand" disabled={saving}>
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
    </form>
  );
}
