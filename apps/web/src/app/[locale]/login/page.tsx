import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AuthCard, SignInForm } from "@/features/auth";
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
    title: "Log in",
    description: `Sign in to your ${site.name} account.`,
    path: "/login",
    index: false,
    locale: await getLocale(),
  });
}

/** Only same-origin relative paths are accepted (no open redirect). */
function safeCallbackUrl(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const t = await getTranslations("auth.card");
  const te = await getTranslations("auth");

  return (
    <AuthCard title={t("login.title")} description={t("login.description")} wide>
      <div className="space-y-4">
        <SignInForm callbackUrl={callbackUrl} />
        <p className="text-muted-foreground text-center text-base">
          {te("signIn.needAccount")}{" "}
          <Link href="/signup" className="text-card-foreground hover:underline">
            {te("signIn.signUpLink")}
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
