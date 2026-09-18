"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n/config";
import { clientEnv } from "@/lib/env/client";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

/**
 * Language switcher (spec §16.1, faza 3.2). The exact analogue of `ThemeToggle`:
 * a global control for a presentation preference the user owns.
 *
 * It does TWO things, and both are needed:
 *   - `PATCH {api}/v1/locale` persists the choice in Nest (the durable row a
 *     day-7 cron mail reads), best-effort: anonymous callers get a 401, which
 *     is the expected no-session case, not an error.
 *   - `document.cookie app-locale` writes the request-time cache the proxy
 *     negotiates from (same pattern as the sign-in form — deliberately NOT
 *     httpOnly, so no web route is needed to write it).
 *   - `router.replace` moves to the same page under the new prefix, so the URL
 *     never disagrees with what is rendered.
 *
 * `usePathname` here is next-intl's, NOT `next/navigation`'s: it returns the path
 * WITHOUT the locale segment (`/blog`, not `/pl/blog`), which is exactly what
 * `replace(..., {locale})` wants. Passing next/navigation's value would produce
 * `/pl/pl/blog`.
 *
 * `replace`, not `push`: a language switch is a correction, not a destination.
 * Leaving it in history means Back returns to the same page in the language the
 * user just rejected.
 */
export function LocaleSwitcher() {
  const t = useTranslations("common.locale");
  const active = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function select(next: Locale) {
    if (next === active) return;
    startTransition(async () => {
      // Persist directly against the main API (faza 3.2): Nest writes the
      // durable row best-effort, and the client owns its cookie — no web
      // route involved. A 401 means "no session" (the anonymous case), not
      // an error: the cookie below still applies. Fire-and-forget — the
      // navigation below must happen even if the persist failed, or a failed
      // write strands the user in the old language with no recourse but
      // retrying the click.
      try {
        await fetch(`${clientEnv.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "")}/v1/locale`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: next }),
        });
      } catch {
        // Offline/transient: the URL move below still applies the language
        // to THIS page; the cookie/row catch up on the next switch.
      }
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("label")} disabled={isPending}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => select(locale)}
            // The active language is marked for assistive tech, not just visually
            // — a checkmark that only exists in CSS says nothing to a screen reader.
            aria-current={locale === active ? "true" : undefined}
            className={locale === active ? "font-medium" : undefined}
          >
            {t(locale)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
