"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client";

export function MemberUploadToggle({
  slug,
  membershipId,
  initial,
}: {
  slug: string;
  membershipId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setError(null);
    setOn(next);
    try {
      await apiPatch("/api/t/" + slug + "/members/" + membershipId, {
        canUpload: next,
      });
      router.refresh();
    } catch (err) {
      setOn(!next); // revert on failure — and say so, instead of silently snapping back
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      disabled={busy}
      title={on ? "可上傳影片" : "不可上傳影片"}
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${
        on ? "bg-[var(--brand)]" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
    {error && (
      <span role="alert" className="text-xs text-red-600">
        {error}
      </span>
    )}
    </span>
  );
}
