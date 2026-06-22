import { pageTenantContext } from "@/lib/page";
import { prisma } from "@/lib/db";

const ACTION_LABEL: Record<string, string> = {
  "video.create": "上傳",
  "video.batch": "批量上傳",
  "video.update": "編輯",
  "video.delete": "刪除",
  "member.approve": "審核",
  "member.reject": "審核",
  "member.upload_permission": "權限",
  "category.create": "分類",
  "category.delete": "分類",
  "tag.create": "標籤",
  "tag.delete": "標籤",
  "settings.update": "設定",
  "branding.update": "品牌",
};

export default async function AuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });

  const logs = await prisma.auditLog.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">活動紀錄</h1>
        <p className="text-sm text-slate-500">
          社團內的操作紀錄(最近 200 筆),管理者與授權上傳者的動作都會記錄。
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-slate-500">目前還沒有任何紀錄。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-4 font-medium">時間</th>
                <th className="py-2 pr-4 font-medium">操作者</th>
                <th className="py-2 pr-4 font-medium">類別</th>
                <th className="py-2 pr-4 font-medium">內容</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0 align-top">
                  <td className="whitespace-nowrap py-2 pr-4 text-slate-500">
                    {l.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4 font-medium text-slate-700">
                    {l.actorName}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="chip bg-slate-100 text-slate-600">
                      {ACTION_LABEL[l.action] ?? l.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-700">{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
