import Link from "next/link";

/**
 * Global 403 boundary (spec 4.2). Rendered whenever a server component, server
 * action, or route handler calls `forbidden()` — the response carries a real 403
 * status, so an unauthorized direct request is rejected regardless of what the UI
 * offered. Enabled by `experimental.authInterrupts` in `next.config.ts`.
 */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-sm text-black/70 dark:text-white/70">
        You don&apos;t have permission to view this page or perform this action.
      </p>
      <Link href="/dashboard" className="text-sm underline">
        Back to your dashboard
      </Link>
    </main>
  );
}
