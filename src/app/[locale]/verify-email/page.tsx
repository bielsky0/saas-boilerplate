import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import Link from "next/link";

import { Button } from "@/components/ui";
import { pageMetadata } from "@/features/content";

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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">
        {isSuccess ? "Email verified" : "Check your inbox"}
      </h1>
      <p className="text-muted-foreground text-sm">
        {isSuccess
          ? "Your email address has been confirmed."
          : "If that email isn't already registered, we've sent a verification link. Open it to finish setting up your account."}
      </p>
      {/* After sign-up the user is signed in (autoSignIn); if they came from an
          invitation, offer a direct link back to it. */}
      <div className="flex flex-col items-center gap-2">
        {!isSuccess && callbackUrl ? (
          <Button asChild>
            <Link href={callbackUrl}>Continue</Link>
          </Button>
        ) : null}
        <Button asChild variant="link">
          <Link href={isSuccess ? "/dashboard" : "/login"}>
            {isSuccess ? "Go to dashboard" : "Back to log in"}
          </Link>
        </Button>
      </div>
    </main>
  );
}
