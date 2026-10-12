import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLogo } from "@/components/layout/admin-logo";
import { Link } from "@/lib/i18n/navigation";
import AuthBackground from "./auth-background";

/**
 * Auth card shell (etap 4, faza 5). Look ported from AdminCN's auth views:
 * full-bleed background shape + centered card with logo, title and
 * description. The FORM inside is always ours (`SignInForm` etc.) — the
 * template's mock forms never cross over.
 *
 * Background is `pointer-events-none` + `aria-hidden`: pure decoration that
 * must never intercept clicks or enter the accessibility tree.
 */
export function AuthCard({
  title,
  description,
  children,
  wide = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative flex h-auto min-h-screen items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute" aria-hidden>
        <AuthBackground />
      </div>
      <Card className={`z-1 w-full gap-6 py-6 ${wide ? "sm:max-w-lg" : "sm:max-w-md"}`}>
        <CardHeader className="gap-6 px-6">
          <Link href="/" aria-label="Home">
            <AdminLogo className="gap-3" />
          </Link>
          <div>
            <CardTitle className="mb-2 text-2xl font-semibold">{title}</CardTitle>
            {description ? (
              <CardDescription className="text-base">{description}</CardDescription>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-6">{children}</CardContent>
      </Card>
    </div>
  );
}
