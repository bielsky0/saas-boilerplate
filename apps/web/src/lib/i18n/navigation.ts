import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALES } from "./config";

/**
 * Locale-aware navigation (spec 16.1).
 *
 * `defineRouting` here is JUST A CONFIG OBJECT. Declaring it does NOT adopt
 * next-intl's middleware — that is a separate export (`next-intl/middleware`)
 * which this codebase never imports, because `src/proxy.ts` owns routing and the
 * default-deny guard must stay the single authority on what a URL means.
 *
 * What this buys is the `<Link>` that prefixes the active locale automatically.
 * That is why the migration off `next/link` can be incremental rather than a
 * big-bang sweep: an un-migrated `<Link href="/login">` still lands correctly,
 * because the proxy redirects `/login` → `/en/login`. The prefix-aware Link just
 * saves the hop.
 *
 * `localePrefix: "always"` is the decision from the plan: `/` redirects to `/en`,
 * so the proxy stays redirect-only and the path the guard checked is always the
 * path the router serves. `as-needed` would need a rewrite, and then those two
 * strings differ — which is exactly where an auth guard goes wrong quietly.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
