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
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { setLocaleAction } from "@/lib/i18n/actions";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

/**
 * Language switcher (spec §16.1). The exact analogue of `ThemeToggle`: a global
 * control for a presentation preference the user owns.
 *
 * It does TWO things, and both are needed:
 *   - `setLocaleAction` persists the choice, so a later visit to an unprefixed
 *     URL (`/`) negotiates to the chosen language instead of the browser's.
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
      await setLocaleAction(next);
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
