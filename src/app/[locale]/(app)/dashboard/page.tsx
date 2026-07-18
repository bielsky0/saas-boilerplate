import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Alert, Button } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import { orgsExposed } from "@/lib/tenancy";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard.meta"))("dashboard") };
}

/**
 * Personal-context dashboard (spec 3.5). The active tenant here is the user's
 * personal account; org contexts live under `/orgs/[slug]`. The shared `(app)`
 * layout provides the navbar + account switcher and the authoritative session
 * guard; this page re-reads the session for its own content (spec 4.2).
 */
export default async function DashboardPage() {
  const session = await requireSession("/dashboard");
  const t = await getTranslations("dashboard.personal");

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
    </div>
  );
}
