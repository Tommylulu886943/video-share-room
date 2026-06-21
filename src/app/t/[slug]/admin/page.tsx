import Link from "next/link";
import { pageTenantContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { MembershipStatus } from "@/lib/constants";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });
  const tenantId = ctx.tenant.id;

  const [pendingMembers, approvedMembers, videos, categories, tags] =
    await Promise.all([
      prisma.membership.count({
        where: { tenantId, status: MembershipStatus.PENDING },
      }),
      prisma.membership.count({
        where: { tenantId, status: MembershipStatus.APPROVED },
      }),
      prisma.video.count({ where: { tenantId } }),
      prisma.category.count({ where: { tenantId } }),
      prisma.tag.count({ where: { tenantId } }),
    ]);

  const membersHref = "/t/" + slug + "/admin/members";
  const videosHref = "/t/" + slug + "/admin/videos";
  const taxonomyHref = "/t/" + slug + "/admin/taxonomy";

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Link
          href={membersHref}
          className={
            "card p-4 " +
            (pendingMembers > 0
              ? "border-amber-300 bg-amber-50"
              : "")
          }
        >
          <div
            className={
              "text-2xl font-bold " +
              (pendingMembers > 0 ? "text-amber-600" : "text-slate-900")
            }
          >
            {pendingMembers}
          </div>
          <div className="mt-1 text-sm text-slate-600">待審核會員</div>
        </Link>

        <div className="card p-4">
          <div className="text-2xl font-bold text-slate-900">
            {approvedMembers}
          </div>
          <div className="mt-1 text-sm text-slate-600">正式會員</div>
        </div>

        <div className="card p-4">
          <div className="text-2xl font-bold text-slate-900">{videos}</div>
          <div className="mt-1 text-sm text-slate-600">影片</div>
        </div>

        <div className="card p-4">
          <div className="text-2xl font-bold text-slate-900">{categories}</div>
          <div className="mt-1 text-sm text-slate-600">分類</div>
        </div>

        <div className="card p-4">
          <div className="text-2xl font-bold text-slate-900">{tags}</div>
          <div className="mt-1 text-sm text-slate-600">標籤</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={videosHref} className="btn-outline">
          新增影片
        </Link>
        <Link href={taxonomyHref} className="btn-outline">
          管理分類
        </Link>
      </div>
    </div>
  );
}
