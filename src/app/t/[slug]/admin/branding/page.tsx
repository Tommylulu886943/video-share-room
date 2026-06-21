import { pageTenantContext } from "@/lib/page";
import { BrandingForm } from "@/components/admin/BrandingForm";

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">品牌設定</h1>
      <BrandingForm
        slug={slug}
        initial={{
          name: ctx.tenant.name,
          brandColor: ctx.tenant.brandColor,
          brandLogo: ctx.tenant.brandLogo,
        }}
      />
    </div>
  );
}
