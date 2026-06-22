"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const root = "/t/" + slug + "/admin";

  const tabs: { label: string; href: string; exact?: boolean }[] = [
    { label: "總覽", href: root, exact: true },
    { label: "會員審核", href: root + "/members" },
    { label: "影片", href: root + "/videos" },
    { label: "分類與標籤", href: root + "/taxonomy" },
    { label: "活動紀錄", href: root + "/audit" },
    { label: "設定", href: root + "/branding" },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
              (active
                ? "bg-[var(--brand)] text-white"
                : "text-slate-600 hover:bg-slate-100")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
