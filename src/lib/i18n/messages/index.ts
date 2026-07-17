import "server-only";

import type { Locale } from "../config";
import en from "./en.json";
import pl from "./pl.json";

/**
 * The message catalogs (spec 16.1).
 *
 * This is the codebase's exhaustive-registry idiom (`JobRegistry`,
 * `TEMPLATE_CATEGORY`) doing two jobs at once:
 *   - `Record<Locale, _>` — adding a locale to `LOCALES` without a catalog is a
 *     compile error, not a runtime 500 on that locale's first visitor.
 *   - `typeof en` — English is the shape. A key present in `en.json` and missing
 *     from `pl.json` is a compile error, so a Polish page cannot silently render a
 *     raw key. (`en` is the fallback, so it is the only honest source of truth for
 *     "what keys exist".)
 *
 * STATIC imports, not `() => import(...)`. At two locales the whole catalog is a
 * few KB, and a dynamic specifier is the trap the content registries document at
 * length: `output: "standalone"` ships only what the bundler traced, and a
 * template-literal import traces nothing. Every specifier here is a literal.
 *
 * `server-only` keeps BOTH catalogs on the server. Only the active locale's
 * messages cross to the browser, serialized by `NextIntlClientProvider` — so
 * adding a tenth language costs the client nothing.
 */
export const MESSAGES: Record<Locale, typeof en> = { en, pl };

export type Messages = typeof en;
