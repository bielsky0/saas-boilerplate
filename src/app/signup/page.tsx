import type { Metadata } from "next";

import { SignUpForm } from "@/features/auth";

export const metadata: Metadata = { title: "Sign up" };

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
