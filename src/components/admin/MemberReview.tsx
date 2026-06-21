"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

export function MemberReview({
  slug,
  membershipId,
}: {
  slug: string;
  membershipId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    setLoading(true);
    setError(null);
    try {
      await apiPost("/api/t/" + slug + "/members/review", {
        membershipId,
        action,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-brand"
          disabled={loading}
          onClick={() => review("approve")}
        >
          核可
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={loading}
          onClick={() => review("reject")}
        >
          拒絕
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
