import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";
import { QuickImport } from "@/components/QuickImport";
import { LoginForm } from "@/components/forms/LoginForm";

export default async function ImportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const session = await getSession();
  if (!session) return (
    <main className="mx-auto max-w-md space-y-5 px-5 py-12">
      <h1 className="text-2xl font-bold">登入後匯入場邊</h1>
      <p>登入後會回到這筆匯入，保留網址與標題。</p>
      <LoginForm stayOnPage />
    </main>
  );
  const candidates = session.platformRole === "SUPER_ADMIN"
    ? await prisma.tenant.findMany({ select: { slug: true }, orderBy: { name: "asc" } })
    : session.memberships.map((m) => ({ slug: m.tenantSlug }));
  const contexts = await Promise.all(candidates.map(({ slug }) => resolveTenantContext(slug, session)));
  const tenants = contexts.filter((ctx) => ctx?.canUpload).map((ctx) => ({ slug: ctx!.tenant.slug, name: ctx!.tenant.name }));
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  return (
    <main className="mx-auto max-w-xl space-y-5 px-5 py-12">
      <h1 className="text-2xl font-bold">快速匯入場邊</h1>
      <p className="text-slate-500">確認社團與內容後匯入。其他網站會以原站連結收藏。</p>
      <QuickImport key={session.id} userId={session.id} tenants={tenants} initialUrl={value("url").slice(0, 8192)} initialTitle={value("title").slice(0, 140)} />
    </main>
  );
}
