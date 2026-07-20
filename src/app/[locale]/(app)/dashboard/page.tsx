import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Alert, Badge, Button } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import { tenantUrl } from "@/lib/tenant-url";
import { orgsEnabled, orgsExposed } from "@/lib/tenancy";
import { isRole } from "@/features/rbac";
import { listUserOrgs } from "@/features/organizations/cross-tenant";
import { servedSubdomain } from "@/features/organizations/served-org";
import AcademyHome from "./academy-home";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard.meta"))("dashboard") };
}

/**
 * `/dashboard` — TWO PAGES SHARING ONE PATH, decided by `Host` (F4.6, §2.27).
 *
 * On an academy host it is that academy's panel; on the apex it is the personal
 * account and a directory of the academies the user belongs to. This mirrors
 * what the proxy already does for `/`: marketing on the apex, that academy's CMS
 * home on a tenant host.
 *
 * ⚠️ IT BRANCHES ON `servedSubdomain()`, NOT `servedOrganization()` (D66). The
 * question is "was an academy host addressed at all", not "does that academy
 * exist" — the second returns null for a NONEXISTENT academy too, which would
 * serve the personal dashboard under every unclaimed `*.langlion.pl`. That exact
 * confusion shipped once in F4.5 and was caught by hand, not by a test.
 * `requireOrgAccess` inside `AcademyHome` then 404s an unknown academy.
 */
export default async function DashboardPage() {
  if (await servedSubdomain()) {
    return <AcademyHome />;
  }
  return <PersonalDashboard />;
}

/**
 * Personal-context dashboard (spec 3.5). The active tenant is the user's own
 * account. The shared `(app)` layout provides the navbar and the authoritative
 * session guard; this re-reads the session for its own content (spec 4.2).
 */
async function PersonalDashboard() {
  const session = await requireSession("/dashboard");
  const t = await getTranslations("dashboard.personal");
  // Skipping the query in `disabled` is not just an optimization: it states that
  // the org table is not consulted at all in that mode (§1.4).
  const orgs = orgsEnabled ? await listUserOrgs(session.user.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        {/* Advertised only in `required` mode (spec §1.4). */}
        {orgsExposed ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/orgs/new">{t("newOrg")}</Link>
          </Button>
        ) : null}
      </div>

      {!session.user.emailVerified ? (
        <Alert role="status" variant="warning">
          {t("verifyEmail")}
        </Alert>
      ) : null}

      {/*
        The email is wrapped by a rich-text tag in the message so the sentence
        around it can be reordered per language — the emphasis lives in the
        catalog, not hard-coded around the interpolation.
      */}
      <p className="text-muted-foreground text-sm">
        {t.rich("signedInAs", {
          email: session.user.email,
          strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
        })}
      </p>

      {orgs.length > 0 ? <AcademyDirectory orgs={orgs} /> : null}
    </div>
  );
}

/**
 * The academies this user belongs to — what REPLACED the account switcher (F4.6).
 *
 * ⚠️ PLAIN `<a>`, NOT `next/link`, AND THAT IS THE WHOLE POINT. Each academy is
 * a different ORIGIN now, so this is a full document load, not client-side
 * navigation — `next/link` would attempt an RSC fetch across origins and fail.
 * More importantly it reflects what §2.19 exception #5 actually specifies: this
 * is a directory of separate installations (the Shopify model), not a switcher
 * that changes the active tenant inside one session. Following a link here may
 * well land on that academy's login page, and that is correct, not a regression.
 */
async function AcademyDirectory({ orgs }: { orgs: Awaited<ReturnType<typeof listUserOrgs>> }) {
  const [t, tr] = await Promise.all([
    getTranslations("dashboard.personal"),
    getTranslations("organizations.roles"),
  ]);
  const entries = await Promise.all(
    orgs.map(async (org) => ({ ...org, href: await tenantUrl(org.subdomain, "/dashboard") })),
  );

  // `role` is typed `string` (straight from the column) but the catalog only
  // names the known roles. Narrow before translating; anything else renders
  // as-is rather than throwing on a missing key — same rule as the members page.
  const roleLabel = (role: string) => (isRole(role) ? tr(role) : role);

  return (
    <section className="border-border flex flex-col gap-3 border-t pt-6">
      <h2 className="text-lg font-medium">{t("yourOrgs")}</h2>
      <p className="text-muted-foreground text-sm">{t("yourOrgsHint")}</p>
      <ul className="flex flex-col gap-2">
        {entries.map((org) => (
          <li key={org.id}>
            <a
              href={org.href}
              className="border-border hover:bg-muted/50 flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium">{org.name}</span>
              <Badge variant="outline">{roleLabel(org.role)}</Badge>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
