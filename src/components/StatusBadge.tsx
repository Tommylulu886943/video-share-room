import { MembershipStatus } from "@/lib/constants";

const MAP: Record<string, { label: string; cls: string }> = {
  [MembershipStatus.PENDING_VERIFICATION]: {
    label: "待 email 驗證",
    cls: "bg-slate-100 text-slate-600",
  },
  [MembershipStatus.PENDING]: {
    label: "待審核",
    cls: "bg-amber-100 text-amber-700",
  },
  [MembershipStatus.APPROVED]: {
    label: "已核可",
    cls: "bg-green-100 text-green-700",
  },
  [MembershipStatus.REJECTED]: {
    label: "已拒絕",
    cls: "bg-red-100 text-red-700",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}
