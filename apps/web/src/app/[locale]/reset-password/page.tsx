import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import Link from "next/link";

import { ResetPasswordForm } from "@/features/auth";
import { pageMetadata } from "@/features/content";

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

  if (!token || hasError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">This link has expired</h1>
          <p className="text-muted-foreground text-sm">
            Reset links are valid for 1 hour and can only be used once.
          </p>
        </div>
        <p className="text-sm">
          <Link href="/forgot-password" className="text-foreground font-medium underline">
            Request a new link
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <p className="text-muted-foreground text-sm">
          Choose a password you haven&apos;t used before.
        </p>
      </div>
      <ResetPasswordForm token={token} />
    </main>
  );
}
