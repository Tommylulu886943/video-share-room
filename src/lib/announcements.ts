export const ANNOUNCEMENT_COLORS = ["blue", "emerald", "amber", "rose", "violet", "slate"] as const;
export type AnnouncementColor = (typeof ANNOUNCEMENT_COLORS)[number];

export const announcementColorStyles: Record<AnnouncementColor, { label: string; panel: string; dot: string }> = {
  blue: { label: "藍色", panel: "border-blue-200 bg-blue-50 text-blue-950", dot: "bg-blue-500" },
  emerald: { label: "綠色", panel: "border-emerald-200 bg-emerald-50 text-emerald-950", dot: "bg-emerald-500" },
  amber: { label: "黃色", panel: "border-amber-200 bg-amber-50 text-amber-950", dot: "bg-amber-500" },
  rose: { label: "紅色", panel: "border-rose-200 bg-rose-50 text-rose-950", dot: "bg-rose-500" },
  violet: { label: "紫色", panel: "border-violet-200 bg-violet-50 text-violet-950", dot: "bg-violet-500" },
  slate: { label: "灰色", panel: "border-slate-300 bg-slate-100 text-slate-950", dot: "bg-slate-500" },
};

export function isAnnouncementColor(value: string): value is AnnouncementColor {
  return (ANNOUNCEMENT_COLORS as readonly string[]).includes(value);
}
