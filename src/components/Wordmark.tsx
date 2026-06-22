import { BRAND } from "@/lib/brand";
import { CourtsideMark } from "@/components/CourtsideMark";

const SIZES = {
  sm: { box: "h-7 w-7 rounded-md", mark: "h-4 w-4", zh: "text-sm", en: "text-[8px] tracking-[0.2em]" },
  md: { box: "h-9 w-9 rounded-lg", mark: "h-5 w-5", zh: "text-base", en: "text-[9px] tracking-[0.22em]" },
  lg: { box: "h-11 w-11 rounded-xl", mark: "h-6 w-6", zh: "text-xl", en: "text-[10px] tracking-[0.25em]" },
} as const;

/**
 * The "場邊 / COURTSIDE" platform wordmark: a monogram tile beside a stacked
 * bilingual lockup. theme="dark" is for dark headers.
 */
export function Wordmark({
  size = "md",
  theme = "light",
}: {
  size?: keyof typeof SIZES;
  theme?: "light" | "dark";
}) {
  const s = SIZES[size];
  const box = theme === "dark" ? "bg-white text-slate-900" : "bg-slate-900 text-white";
  const zh = theme === "dark" ? "text-white" : "text-slate-900";
  const en = theme === "dark" ? "text-white/50" : "text-slate-400";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`grid place-items-center ${s.box} ${box}`}>
        <CourtsideMark className={s.mark} />
      </span>
      <span className="flex flex-col leading-none">
        <span className={`font-bold tracking-tight ${s.zh} ${zh}`}>{BRAND.zh}</span>
        <span className={`font-medium uppercase ${s.en} ${en}`}>{BRAND.en}</span>
      </span>
    </span>
  );
}
