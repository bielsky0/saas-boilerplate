import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

/**
 * Locale primitives (spec 16) — pure, dependency-light, no React.
 *
 * This module is deliberately separate from `./index.ts`. It is imported by
 * `src/proxy.ts` and `src/lib/public-routes.ts`, and the barrel re-exports
 * next-intl's navigation (a React client component). Importing the barrel from
 * the proxy would drag React's navigation into the proxy bundle for the sake of
 * four string functions. Pure things live here; anything that needs React or a
 * request lives above it.
 */

/**
 * Supported locales. `en` is first AND is the fallback — the two are separate
 * facts that happen to coincide, so `DEFAULT_LOCALE` is named rather than
 * `LOCALES[0]`.
 */
export const LOCALES = ["en", "pl"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie holding an explicit choice. The DB is the durable store — see §16 in the plan. */
export const LOCALE_COOKIE = "app-locale";

/** Header the proxy uses to hand the resolved locale to the render. */
export const LOCALE_HEADER = "x-app-locale";

/** Open Graph wants a territory-qualified tag; our locales are language-only. */
export const OG_LOCALE: Record<Locale, string> = {
  en: "en_US",
  pl: "pl_PL",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale prefix of a pathname, or null when there is none.
 *
 * Matches `/pl` exactly or `/pl/…` only. The bug this exists to prevent is
 * `startsWith("/pl")`, which also matches `/plans` — and then `/plans` renders in
 * Polish, or worse, gets stripped to `/ans` and 404s.
 */
export function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : null;
}

/**
 * Drop the locale prefix, yielding the "bare" path the route tables are keyed by.
 *
 * `/pl` → `/`, NOT `""`. This is load-bearing: `PUBLIC_PAGE_ROUTES` keys the home
 * page as `"/"`, so an empty string would make the Polish landing page a
 * non-public path and default-deny would 307 it to /login. Idempotent — a bare
 * path passes through unchanged, which is what lets `isPublicPage` call this
 * unconditionally.
 */
export function stripLocale(pathname: string): string {
  const locale = localeFromPathname(pathname);
  if (!locale) return pathname;
  const bare = pathname.slice(`/${locale}`.length);
  return bare === "" ? "/" : bare;
}

/** Add a locale prefix to a bare path. `withLocale("/", "pl")` → `/pl`. */
export function withLocale(pathname: string, locale: Locale): string {
  const bare = stripLocale(pathname);
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}

/**
 * Parse an Accept-Language header into an ordered preference list.
 *
 * Wrapped because this runs in the PROXY, on every request, with attacker-supplied
 * input: `Negotiator` throws on some malformed headers, and an exception here
 * takes down every route rather than one. A bot sending `Accept-Language: ???`
 * must cost us a fallback, not the site.
 */
function preferredLanguages(acceptLanguage: string | null | undefined): string[] {
  if (!acceptLanguage) return [];
  try {
    const languages = new Negotiator({
      headers: { "accept-language": acceptLanguage },
    }).languages();
    // `*` is a valid Accept-Language token but not a language tag; `match` rejects
    // it with a RangeError, so it never reaches the matcher.
    return languages.filter((language) => language !== "*");
  } catch {
    return [];
  }
}

/**
 * Resolve the locale for a request. Pure — every input is passed in.
 *
 * Precedence: URL > cookie > Accept-Language > default. The URL wins because it
 * is the thing a user can link, bookmark and share; a cookie silently overriding
 * `/pl/blog` back to English would make the URL a lie.
 *
 * NOTE THE ABSENCE OF THE DATABASE, which is deliberate. This runs in the proxy,
 * whose whole value is being fast and DB-free. `user.locale` is the durable store,
 * but it reaches a request by seeding the COOKIE at sign-in — never by a query
 * here.
 */
export function negotiateLocale(input: {
  pathLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.pathLocale)) return input.pathLocale;
  if (isLocale(input.cookieLocale)) return input.cookieLocale;

  const languages = preferredLanguages(input.acceptLanguage);
  if (languages.length === 0) return DEFAULT_LOCALE;

  try {
    // `match` does the RFC 4647 lookup, so `pl-PL` resolves to `pl` and `en-GB`
    // to `en` without us maintaining a table of territory variants.
    return match(languages, LOCALES as readonly string[], DEFAULT_LOCALE) as Locale;
  } catch {
    // RangeError on a structurally invalid tag that survived the filter above.
    return DEFAULT_LOCALE;
  }
}
