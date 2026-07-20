import { getTranslations } from "next-intl/server";

import { BillingPanel } from "@/features/billing/components/billing-panel";
import { requireOrgPermission } from "@/features/organizations/context";

/**
 * Organization billing (spec 5.3, 5.5).
 *
 * Guarded by `billing.manage`, which is Owner-only — an Admin hitting this route
 * directly gets a real 403 via the shared chokepoint, exactly like every other
 * org page (spec 4.2). This is also the URL the payment provider returns the
 * browser to after checkout or a portal session.
 */
export default async function OrgBillingPage() {
  const { org } = await requireOrgPermission("billing.manage");
  const t = await getTranslations("billing");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{org.name}</p>
      </div>

      <BillingPanel owner={{ kind: "organization", organizationId: org.id }} />
    </div>
  );
}
