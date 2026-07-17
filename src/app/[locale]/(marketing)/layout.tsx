import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { site } from "@/lib/site";

/**
 * Shared chrome for the public content pages (spec 7.3, 8).
 *
 * A route group, so /blog, /docs and /changelog share a header and footer
 * without adding a segment to their URLs. It is NOT a second root layout: the
 * app has exactly one <html>, in src/app/[locale]/layout.tsx.
 *
 * The landing page deliberately stays outside this group — it has its own
 * full-bleed hero chrome and a different header treatment.
 *
 * `Link` is next-intl's (see src/lib/i18n/navigation.ts), so `/docs` renders as
 * `/pl/docs` for a Polish reader. The hrefs below stay BARE — writing `/pl/docs`
 * here would hard-code one language into shared chrome.
 */

/**
 * `labelKey`, not `label`: the nav is a data table, and a translated string is
 * not data — it is a fact about the current request. Keys survive a locale
 * switch; strings baked in at module scope do not.
 */
const NAV = [
  { href: "/docs", labelKey: "docs" },
  { href: "/blog", labelKey: "blog" },
  { href: "/changelog", labelKey: "changelog" },
] as const;

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("nav");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              {site.name}
            </Link>
            <nav aria-label={t("contentLabel")} className="flex items-center gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t(item.labelKey)}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">{t("logIn")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">{t("getStarted")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm sm:flex-row">
          <span>
            © {new Date().getFullYear()} {site.name}
          </span>
          <div className="flex items-center gap-4">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {t(item.labelKey)}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
