import { pageTenantContext } from "@/lib/page";
import { BrandingForm } from "@/components/admin/BrandingForm";
import { RegistrationSettings } from "@/components/admin/RegistrationSettings";

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx } = await pageTenantContext(slug, { admin: true });

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
