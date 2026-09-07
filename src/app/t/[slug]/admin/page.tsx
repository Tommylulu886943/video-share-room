import Link from "next/link";
import { pageTenantContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { MembershipStatus } from "@/lib/constants";
import { startOfTodayTaipei } from "@/lib/time";
import { getFlatCategories } from "@/lib/categories";

const DAY_MS = 24 * 60 * 60 * 1000;

function taipeiDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function taipeiTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });
  const tenantId = ctx.tenant.id;

  const todayStart = startOfTodayTaipei();
  const chartStart = new Date(todayStart.getTime() - 6 * DAY_MS);

  const [
    pendingMembers,
    approvedMembers,
    videos,
    categories,
    tags,
    onlineToday,
    viewAgg,
    onlineMembers,
    chartVideos,
    topVideos,
    todayUploads,
    flatCategories,
  ] = await Promise.all([
    prisma.membership.count({
      where: { tenantId, status: MembershipStatus.PENDING },
    }),
    prisma.membership.count({
      where: { tenantId, status: MembershipStatus.APPROVED },
    }),
    prisma.video.count({ where: { tenantId } }),
    prisma.category.count({ where: { tenantId } }),
    prisma.tag.count({ where: { tenantId } }),
    prisma.membership.count({
      where: {
        tenantId,
        status: MembershipStatus.APPROVED,
        user: { lastSeenAt: { gte: todayStart } },
      },
    }),
    prisma.video.aggregate({ where: { tenantId }, _sum: { viewCount: true } }),
    prisma.membership.findMany({
      where: {
        tenantId,
        status: MembershipStatus.APPROVED,
        user: { lastSeenAt: { gte: todayStart } },
      },
      orderBy: { user: { lastSeenAt: "desc" } },
      select: { name: true, level: true, user: { select: { lastSeenAt: true } } },
    }),
    prisma.video.findMany({
      where: { tenantId },
      select: { createdAt: true, categoryId: true },
    }),
    prisma.video.findMany({
      where: { tenantId },
      orderBy: [{ viewCount: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, title: true, viewCount: true },
    }),
    prisma.video.findMany({
      where: { tenantId, createdAt: { gte: todayStart } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        uploadedBy: {
          select: {
            username: true,
            memberships: {
              where: { tenantId },
              take: 1,
              select: { name: true },
            },
          },
        },
      },
    }),
    getFlatCategories(tenantId),
  ]);
  const totalViews = viewAgg._sum.viewCount ?? 0;

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(chartStart.getTime() + index * DAY_MS);
    const key = taipeiDateKey(date);
    return {
      key,
      label: `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
      count: chartVideos.filter((video) => taipeiDateKey(video.createdAt) === key).length,
    };
  });
  const maxDailyUploads = Math.max(1, ...days.map((day) => day.count));

  const categoryById = new Map(flatCategories.map((category) => [category.id, category]));
  const categoryCounts = new Map<string, number>();
  for (const video of chartVideos) {
    const category = video.categoryId ? categoryById.get(video.categoryId) : null;
    const root = category?.parentId ? categoryById.get(category.parentId) : category;
    const label = root?.name ?? "未分類";
    categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
  }
  const categoryChart = [...categoryCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const maxCategoryCount = Math.max(1, ...categoryChart.map((item) => item.count));

  const membersHref = "/t/" + slug + "/admin/members";
  const videosHref = "/t/" + slug + "/admin/videos";
  const taxonomyHref = "/t/" + slug + "/admin/taxonomy";

  return (
    <div className="space-y-6">
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
          <div className="text-2xl font-bold text-green-600">{onlineToday}</div>
          <div className="mt-1 text-sm text-slate-600">今日上線</div>
        </div>

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
          <div className="text-2xl font-bold text-slate-900">
            {totalViews.toLocaleString()}
          </div>
          <div className="mt-1 text-sm text-slate-600">總點閱</div>
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

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card min-w-0 p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">近 7 日新增影片</h2>
              <p className="text-sm text-slate-500">依影片上傳日期統計</p>
            </div>
            <span className="chip bg-slate-100 text-slate-600">
              共 {days.reduce((sum, day) => sum + day.count, 0)} 部
            </span>
          </div>
          <div className="grid h-44 grid-cols-7 items-end gap-2 border-b border-slate-200 px-1">
            {days.map((day) => (
              <div key={day.key} className="flex h-full flex-col items-center justify-end gap-2">
                <span className="text-xs font-semibold text-slate-600">{day.count}</span>
                <div
                  className="min-h-1 w-full max-w-10 rounded-t-md bg-[var(--brand)] opacity-85"
                  style={{ height: `${Math.max(4, (day.count / maxDailyUploads) * 112)}px` }}
                  title={`${day.label}：${day.count} 部`}
                />
                <span className="pb-2 text-[11px] text-slate-400">{day.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card min-w-0 p-5">
          <div className="mb-4">
            <h2 className="font-semibold">影片分類分布</h2>
            <p className="text-sm text-slate-500">依第一層分類彙整</p>
          </div>
          {categoryChart.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">尚無影片資料</p>
          ) : (
            <div className="space-y-3">
              {categoryChart.map((item) => (
                <div key={item.name}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="truncate text-slate-700">{item.name}</span>
                    <span className="font-semibold text-slate-500">{item.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--brand)]"
                      style={{ width: `${(item.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">今日上線會員</h2>
              <p className="text-sm text-slate-500">今天曾進入系統的正式會員</p>
            </div>
            <span className="grid h-9 min-w-9 place-items-center rounded-full bg-emerald-100 px-2 text-sm font-bold text-emerald-700">
              {onlineMembers.length}
            </span>
          </div>
          {onlineMembers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">今天還沒有會員上線</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {onlineMembers.map((member) => (
                <div key={`${member.name}-${member.level}`} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 font-semibold text-emerald-700">
                    {member.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{member.name}</p>
                    <p className="text-xs text-slate-400">{member.level}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {member.user.lastSeenAt ? taipeiTime(member.user.lastSeenAt) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card min-w-0 p-5">
          <div className="mb-4">
            <h2 className="font-semibold">熱門影片</h2>
            <p className="text-sm text-slate-500">依累積觀看次數排序</p>
          </div>
          {topVideos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">尚無影片資料</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {topVideos.map((video, index) => (
                <li key={video.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-500">
                    {index + 1}
                  </span>
                  <Link
                    href={`/t/${slug}/video/${video.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 hover:text-[var(--brand)]"
                  >
                    {video.title}
                  </Link>
                  <span className="text-xs text-slate-500">{video.viewCount.toLocaleString()} 次</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-4">
          <h2 className="font-semibold">今日新增影片</h2>
          <p className="text-sm text-slate-500">今天上傳了哪些內容、由誰上傳</p>
        </div>
        {todayUploads.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">今天尚未新增影片</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayUploads.map((video) => (
              <div key={video.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-xs text-slate-400">{taipeiTime(video.createdAt)}</span>
                <Link
                  href={`/t/${slug}/video/${video.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 hover:text-[var(--brand)]"
                >
                  {video.title}
                </Link>
                <span className="text-xs text-slate-500">
                  上傳者：{video.uploadedBy?.memberships[0]?.name ?? video.uploadedBy?.username ?? "系統"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
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
