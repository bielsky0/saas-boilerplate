import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui";
import { SignOutButton } from "@/features/auth";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { requireSuperAdmin } from "@/features/admin/context";

/**
 * Super-admin shell (spec 6.1) — a separate route group from `(app)` on purpose.
 *
 * `(app)`'s shell renders the account switcher and tenant navigation, which are
 * meaningless in a panel that reads across every tenant. Keeping the group
 * boundary also makes "no admin route sits inside the tenant shell" visible in
 * the file tree rather than a convention someone has to remember.
 *
 * The `requireSuperAdmin()` here is for the shell only. It is NOT the boundary:
 * layouts do not guard server actions, and a page can render through a different
 * path. Every admin page and action calls the guard again as its own first line.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { actorEmail } = await requireSuperAdmin();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className="shrink-0 font-semibold">
              SaaS
            </Link>
            <Badge variant="destructive">Admin</Badge>
            <span className="text-muted-foreground truncate text-sm">{actorEmail}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              Exit admin
            </Link>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <AdminNav />
        <div className="pt-6">{children}</div>
      </main>
    </div>
  );
}
