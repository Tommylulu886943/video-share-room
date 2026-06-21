"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface TenantItem {
  slug: string;
  name: string;
  brandLogo: string | null;
}

export function TenantSwitcher({
  current,
  tenants,
}: {
  current: TenantItem;
  tenants: TenantItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Only render as a switcher when there is more than one tenant (FR-4 / D9).
  if (tenants.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <Logo logo={current.brandLogo} />
        <span className="font-bold text-white">{current.name}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-white transition hover:bg-white/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Logo logo={current.brandLogo} />
        <span className="font-bold">{current.name}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className="opacity-80"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {tenants.map((t) => {
            const active = t.slug === current.slug;
            return (
              <button
                key={t.slug}
                role="option"
                aria-selected={active}
                onClick={() => {
                  setOpen(false);
                  if (!active) router.push(`/t/${t.slug}`);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${
                  active
                    ? "bg-slate-50 font-semibold text-slate-900"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-sm">
                  {t.brandLogo || "🎬"}
                </span>
                <span className="flex-1 truncate">{t.name}</span>
                {active && <span className="text-[var(--brand)]">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Logo({ logo }: { logo: string | null }) {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-md bg-white/15 text-base">
      {logo || "🎬"}
    </span>
  );
}
