import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { SignUpForm } from "@/features/auth";
import { pageMetadata } from "@/features/content";
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-muted-foreground text-sm">Sign up with your email and a password.</p>
      </div>
      <SignUpForm callbackUrl={callbackUrl} />
    </main>
  );
}
