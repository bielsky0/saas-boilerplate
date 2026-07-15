import type { Metadata } from "next";

import { SignUpForm } from "@/features/auth";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Sign up with your email and a password.
        </p>
      </div>
      <SignUpForm />
    </main>
  );
}
