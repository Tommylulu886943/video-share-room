import { pageTenantContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { buildTree } from "@/lib/categories";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";

export default async function TaxonomyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });

  const flat = await prisma.category.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { access: { select: { membershipId: true } } },
  });
  const permissions = (id: string) => {
    const item = flat.find(c => c.id === id)!;
    return { visibility: item.visibility, accessMembershipIds: item.access.map(a => a.membershipId) };
  };
  const members = await prisma.membership.findMany({
    where: { tenantId: ctx.tenant.id, status: "APPROVED" },
    select: { id: true, name: true, user: { select: { username: true } } },
    orderBy: { name: "asc" },
  });
  const tree = buildTree(flat).map((top) => ({
    id: top.id,
    ...permissions(top.id),
    name: top.name,
    children: top.children.map((child) => ({ id: child.id, name: child.name, ...permissions(child.id) })),
  }));

  const tags = await prisma.tag.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { access: { select: { membershipId: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">分類與標籤</h1>
        <p className="mt-1 text-sm text-slate-500">
          管理影片的分類（兩層）與標籤。
        </p>
      </header>
      <TaxonomyManager slug={slug} tree={tree} members={members.map(m => ({ id: m.id, name: m.name, username: m.user.username }))} tags={tags.map(t => ({ id: t.id, name: t.name, visibility: t.visibility, accessMembershipIds: t.access.map(a => a.membershipId) }))} />
    </div>
  );
}
