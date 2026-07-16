import type { Metadata } from "next";

import { SignInForm } from "@/features/auth";

export const metadata: Metadata = { title: "Log in" };

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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Log in to your account.</p>
      </div>
      <SignInForm callbackUrl={callbackUrl} />
    </main>
  );
}
