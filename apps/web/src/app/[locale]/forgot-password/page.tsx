import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeftIcon } from "lucide-react";

import { AuthCard, ForgotPasswordForm } from "@/features/auth";
import { buttonVariants } from "@/components/ui/button";
import { pageMetadata } from "@/features/content";
import { Link } from "@/lib/i18n/navigation";

/**
 * `generateMetadata`, not a static `metadata` object: the canonical, hreflang and
 * og:locale all depend on which language is being served, and a static object
 * cannot see the `[locale]` segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Forgot password",
    description: "Request a link to set a new password for your account.",
    path: "/forgot-password",
    index: false,
    locale: await getLocale(),
  });
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.card");
  const te = await getTranslations("auth");

  return (
    <AuthCard title={t("forgot.title")} description={t("forgot.description")}>
      <div className="space-y-4">
        <ForgotPasswordForm />
        {/*
          Plain Link with button styles, NOT Button+render: Base UI stamps
          role="button" onto rendered anchors (faza 2) — a back-link must
          keep its link role.
        */}
        <Link
          href="/login"
          className={buttonVariants({ variant: "ghost", className: "group w-full" })}
        >
          <ChevronLeftIcon className="size-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
          {te("shared.backToLogin")}
        </Link>
      </div>
    </AuthCard>
  );
}
