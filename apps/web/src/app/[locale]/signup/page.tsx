import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AuthCard, SignUpForm } from "@/features/auth";
import { pageMetadata } from "@/features/content";
import { Link } from "@/lib/i18n/navigation";
import { site } from "@/lib/site";

/**
 * `generateMetadata`, not a static `metadata` object: the canonical, hreflang and
 * og:locale all depend on which language is being served, and a static object
 * cannot see the `[locale]` segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Sign up",
    description: `Create your ${site.name} account and start building.`,
    path: "/signup",
    index: false,
    locale: await getLocale(),
  });
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.callbackUrl) ? params.callbackUrl[0] : params.callbackUrl;
  const callbackUrl = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;
  const t = await getTranslations("auth.card");
  const te = await getTranslations("auth");

  return (
    <AuthCard title={t("signup.title")} description={t("signup.description")} wide>
      <div className="space-y-4">
        <SignUpForm callbackUrl={callbackUrl} />
        <p className="text-muted-foreground text-center text-base">
          {te("signUp.haveAccount")}{" "}
          <Link href="/login" className="text-card-foreground hover:underline">
            {te("shared.logInLink")}
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
