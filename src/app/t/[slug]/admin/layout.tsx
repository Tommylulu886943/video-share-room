import { ReactNode } from "react";
import Link from "next/link";
import { pageTenantContext } from "@/lib/page";
import { AdminTabs } from "@/components/AdminTabs";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await pageTenantContext(slug, { admin: true });

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">管理後台</h1>
        <Link href={"/t/" + slug} className="btn-outline">
          回到影片牆
        </Link>
      </div>
      <div className="mb-5">
        <AdminTabs slug={slug} />
      </div>
      {children}
    </main>
  );
}
