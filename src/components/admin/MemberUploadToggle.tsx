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

  async function toggle() {
    const next = !on;
    setBusy(true);
    setOn(next);
    try {
      await apiPatch("/api/t/" + slug + "/members/" + membershipId, {
        canUpload: next,
      });
      router.refresh();
    } catch {
      setOn(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}
