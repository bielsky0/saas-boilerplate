import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui";
import { AuthCard } from "@/features/auth";
import { pageMetadata } from "@/features/content";
import { Link } from "@/lib/i18n/navigation";

/**
 * `generateMetadata`, not a static `metadata` object: the canonical, hreflang and
 * og:locale all depend on which language is being served, and a static object
 * cannot see the `[locale]` segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Verify your email",
    description: "Confirm your email address to finish setting up your account.",
    path: "/verify-email",
    index: false,
    locale: await getLocale(),
  });
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  const isSuccess = status === "success";
  const rawCallback = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;
  const callbackUrl =
    rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : undefined;
  const t = await getTranslations("auth.card");
  const te = await getTranslations("auth");

  return (
    <AuthCard
      title={isSuccess ? t("verify.successTitle") : t("verify.checkTitle")}
      description={isSuccess ? t("verify.successBody") : t("verify.checkBody")}
    >
      <div className="flex flex-col items-center gap-2">
        {/* After sign-up the user is signed in (autoSignIn); if they came from an
            invitation, offer a direct link back to it. */}
        {!isSuccess && callbackUrl ? (
          <Link href={callbackUrl} className={buttonVariants()}>
            {t("verify.continue")}
          </Link>
        ) : null}
        <Link
          href={isSuccess ? "/dashboard" : "/login"}
          className={buttonVariants({ variant: "link" })}
        >
          {isSuccess ? t("verify.goDashboard") : te("shared.backToLogin")}
        </Link>
      </div>
    </AuthCard>
  );
}
