import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/features/auth";
import { pageMetadata } from "@/features/content";

export const metadata: Metadata = pageMetadata({
  title: "Forgot password",
  description: "Request a link to set a new password for your account.",
  path: "/forgot-password",
  index: false,
});

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and we&apos;ll send you a link to set a new one.
        </p>
      </div>
      <ForgotPasswordForm />
    </main>
  );
}
