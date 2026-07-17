import { createFormatter, createTranslator, type NamespaceKeys, type NestedKeyOf } from "next-intl";

import { type Locale } from "./config";
import { MESSAGES, type Messages } from "./messages";

/**
 * Internationalization (spec 16).
 *
 * Locale detection/selection, translation loading, and locale-aware formatting
 * of dates, numbers, and currencies. All user-facing copy (UI, emails, error
 * messages) is resolved through here rather than hard-coded in components.
 *
 * ─── Which door to use ──────────────────────────────────────────────────────
 *
 *   In a component      →  useTranslations() / getTranslations()  (next-intl)
 *   Outside a request   →  getTranslator() / getFormatter()       (below)
 *   Routing / paths     →  ./config (pure; the proxy imports THAT, not this)
 *
 * The middle row is not a convenience, it is a requirement. Email templates
 * render inside a CRON DRAIN: no request, no headers, no React cache. The §10.3
 * onboarding sequence sends on day 7, a week after any request that could have
 * carried a locale. `getTranslations()` would throw there. These two are pure
 * functions of (locale, messages), which is why a job can use them.
 */

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  OG_LOCALE,
  isLocale,
  localeFromPathname,
  negotiateLocale,
  stripLocale,
  withLocale,
  type Locale,
} from "./config";

export { MESSAGES, type Messages } from "./messages";

export { Link, redirect, routing, usePathname, useRouter, getPathname } from "./navigation";

/**
 * A translator for a known locale, with NO request context.
 *
 * `createTranslator` (not `getTranslations`) is the whole point: it takes the
 * messages as an argument instead of reaching for `getRequestConfig` + React's
 * `cache`. Full ICU — plurals, selects, interpolation — with nothing to await.
 *
 * The namespace stays a typed literal rather than a `string`: callers name it in
 * source (`getTranslator(locale, "emails")`), so there is no reason to widen it
 * and lose key checking on `t()`. `MESSAGES[locale]` cannot actually be undefined
 * — `Record<Locale, _>` guarantees it — so there is no fallback here to hide a
 * missing catalog behind English.
 */
export function getTranslator<const N extends NamespaceKeys<Messages, NestedKeyOf<Messages>>>(
  locale: Locale,
  namespace?: N,
) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace });
}

/**
 * A translator scoped to one namespace, as a nameable type.
 *
 * For code that RECEIVES a translator rather than making one — a zod schema
 * factory, an email template. Structurally identical to what `getTranslations()`
 * returns, so the same function accepts either: a server action passes the async
 * one, a background job passes `getTranslator`'s. That interchangeability is the
 * point — it means a validation message is written once and works on both sides
 * of the request boundary.
 */
export type NamespaceTranslator<N extends NamespaceKeys<Messages, NestedKeyOf<Messages>>> =
  ReturnType<typeof getTranslator<N>>;

/** Locale-aware number/date/currency formatting outside a request. */
export function getFormatter(locale: Locale) {
  return createFormatter({ locale });
}
