import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  const isSuccess = status === "success";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">
        {isSuccess ? "Email verified" : "Check your inbox"}
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        {isSuccess
          ? "Your email address has been confirmed."
          : "If that email isn't already registered, we've sent a verification link. Open it to finish setting up your account."}
      </p>
      <Link href={isSuccess ? "/dashboard" : "/login"} className="text-sm underline">
        {isSuccess ? "Go to dashboard" : "Back to log in"}
      </Link>
    </main>
  );
}
