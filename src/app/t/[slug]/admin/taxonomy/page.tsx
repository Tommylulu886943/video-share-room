import { pageTenantContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { getFlatCategories, buildTree } from "@/lib/categories";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";

export default async function TaxonomyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });

  const flat = await getFlatCategories(ctx.tenant.id);
  const tree = buildTree(flat).map((top) => ({
    id: top.id,
    name: top.name,
    children: top.children.map((child) => ({ id: child.id, name: child.name })),
  }));

  const tags = await prisma.tag.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">分類與標籤</h1>
        <p className="mt-1 text-sm text-slate-500">
          管理影片的分類（兩層）與標籤。
        </p>
      </header>
      <TaxonomyManager slug={slug} tree={tree} tags={tags} />
    </div>
  );
}
