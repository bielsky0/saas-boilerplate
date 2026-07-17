import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale, type Locale } from "./config";
import { MESSAGES } from "./messages";

/**
 * next-intl's per-request configuration (spec 16.1). Wired in `next.config.ts`.
 *
 * We use next-intl for MESSAGES, not for ROUTING — its middleware is never
 * imported. Locale routing lives in `src/proxy.ts`, composed with the default-deny
 * auth guard, so exactly one thing decides what a URL means.
 *
 * The resolution order below is three fallbacks deep, and each one earns its place:
 */
async function resolveLocale(
  explicit: Locale | undefined,
  requestLocale: Promise<string | undefined>,
): Promise<Locale> {
  // 1. An explicit override from `getTranslations({locale})`. Rare on a request;
  //    this is the door server-side callers use to render in a chosen language.
  if (isLocale(explicit)) return explicit;

  // 2. The `[locale]` segment — the normal path for every page.
  const segment = await requestLocale;
  if (isLocale(segment)) return segment;

  // 3. The header the proxy set. THIS IS THE GUARANTEE, not a nicety:
  //    `forbidden.tsx` takes NO PROPS (Next's own docs say so), so it cannot
  //    receive `params.locale` and step 2 returns undefined for it. Without this,
  //    every 403 page would render in English regardless of the URL.
  try {
    const locale = (await headers()).get(LOCALE_HEADER);
    if (isLocale(locale)) return locale;
  } catch {
    // No request scope. Nothing to read; fall through.
  }

  // 4. next-intl's own docs warn that `[locale]` acts as a catch-all for unknown
  //    routes (`/unknown.txt`), so an invalid value MUST resolve to a real locale
  //    rather than throw — a 404 should render, not 500.
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const resolved = await resolveLocale(locale as Locale | undefined, requestLocale);
  return { locale: resolved, messages: MESSAGES[resolved] };
});
