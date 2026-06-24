import { pageTenantContext } from "@/lib/page";
import { getFlatCategories, buildTree } from "@/lib/categories";
import { BrandingForm } from "@/components/admin/BrandingForm";
import { RegistrationSettings } from "@/components/admin/RegistrationSettings";
import { DefaultCategoryForm } from "@/components/admin/DefaultCategoryForm";

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });
  const categoryTree = buildTree(await getFlatCategories(ctx.tenant.id));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">設定</h1>
      <RegistrationSettings
        slug={slug}
        initial={{
          requireEmailVerification: ctx.tenant.requireEmailVerification,
          requireApproval: ctx.tenant.requireApproval,
        }}
      />
      <DefaultCategoryForm
        slug={slug}
        categories={categoryTree}
        current={ctx.tenant.defaultCategoryId}
      />
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
