import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AuthCard, ResetPasswordForm } from "@/features/auth";
import { pageMetadata } from "@/features/content";
import { Link } from "@/lib/i18n/navigation";

/**
 * `generateMetadata`, not a static `metadata` object: the canonical, hreflang and
 * og:locale all depend on which language is being served, and a static object
 * cannot see the `[locale]` segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Reset password",
    description: "Choose a new password for your account.",
    path: "/reset-password",
    index: false,
    locale: await getLocale(),
  });
}

/**
 * Landing page for the emailed reset link (spec 2.1).
 *
 * The link in the email points at the auth engine, not here: it validates the
 * token first, then redirects to `/reset-password?token=…` on success, or
 * `?error=INVALID_TOKEN` when the token is expired, already used, or forged. So
 * this page never validates a token itself — it only renders whichever of those
 * two outcomes arrived.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const hasError = typeof params.error === "string";
  const t = await getTranslations("auth.card");

  if (!token || hasError) {
    return (
      <AuthCard title={t("resetExpired.title")} description={t("resetExpired.description")}>
        <p className="text-sm">
          <Link href="/forgot-password" className="text-foreground font-medium underline">
            {t("resetExpired.requestNew")}
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("reset.title")} description={t("reset.description")}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
