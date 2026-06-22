"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client";

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-[var(--brand)]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export function RegistrationSettings({
  slug,
  initial,
}: {
  slug: string;
  initial: { requireEmailVerification: boolean; requireApproval: boolean };
}) {
  const router = useRouter();
  const [emailV, setEmailV] = useState(initial.requireEmailVerification);
  const [approval, setApproval] = useState(initial.requireApproval);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: { emailV: boolean; approval: boolean }) {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await apiPatch("/api/t/" + slug + "/settings", {
        requireEmailVerification: next.emailV,
        requireApproval: next.approval,
      });
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
      <h2 className="font-semibold text-slate-900">註冊與審核</h2>
      <p className="mt-1 text-sm text-slate-500">
        兩項都關閉時，新成員一申請就自動通過、可立即觀看（不需收信、不需審核）。
      </p>
      <div className="mt-3 divide-y divide-slate-100">
        <Toggle
          checked={emailV}
          onChange={(v) => {
            setEmailV(v);
            save({ emailV: v, approval });
          }}
          label="需要 email 驗證"
          hint="開啟後，新成員須點擊驗證信連結才算完成申請（需設定好寄信服務）。"
        />
        <Toggle
          checked={approval}
          onChange={(v) => {
            setApproval(v);
            save({ emailV, approval: v });
          }}
          label="需要管理者審核"
          hint="開啟後，新成員須由管理者在「會員審核」核可後才能觀看。"
        />
      </div>
      {(msg || error || saving) && (
        <p
          className={`mt-3 text-sm ${error ? "text-red-600" : "text-slate-500"}`}
        >
          {saving ? "儲存中…" : error ?? msg}
        </p>
      )}
    </div>
  );
}
