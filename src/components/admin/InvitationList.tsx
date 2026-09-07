"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete } from "@/lib/client";

export function InvitationList({ slug, invitations }: {
  slug: string; invitations: { id: string; name: string; expiresAt: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!invitations.length) return null;
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">尚未接受的邀請</h2>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {invitations.map(invitation => <div key={invitation.id} className="flex items-center justify-between gap-3 text-sm">
      <span>{invitation.name} · 到期：{invitation.expiresAt.slice(0, 10)}</span>
      <button className="btn-outline" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { await apiDelete(`/api/t/${slug}/invitations`, { id: invitation.id }); router.refresh(); }
        catch (err) { setError(err instanceof Error ? err.message : "撤銷失敗"); }
        finally { setBusy(false); }
      }}>撤銷邀請</button>
    </div>)}
  </section>;
}
