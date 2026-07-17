import { cookies, headers } from "next/headers";

import { LOCALE_COOKIE, LOCALE_HEADER, type Locale, isLocale } from "./config";

/**
 * The locale in effect for the CURRENT request, or null if there isn't one.
 *
 * Returns `Locale | null`, never a default — the caller has to decide what "we
 * were never told" means, because the two callers mean different things by it
 * (see user-locale.ts's header for the same split on the DB side).
 *
 * Resolution order mirrors the proxy's, and the header comes first because the
 * proxy ALREADY did the negotiation for this request (URL > cookie >
 * Accept-Language). Re-deriving it here from the cookie alone would disagree with
 * the proxy the moment a user reads `/pl/...` with an English cookie — the URL
 * wins there, and the header is how that answer travels.
 *
 * Null happens legitimately and often:
 *   - outside a request scope entirely (a cron drain, an engine hook on its own
 *     connection) — `headers()` throws, exactly as features/admin/audit.ts
 *     documents;
 *   - on `/api/*`, which the proxy exempts from locale prefixing, so no header is
 *     set (this is why `/api/dev/seed-user` produces users with `locale = NULL`).
 *
 * Not exported from ./index.ts: that barrel re-exports client navigation, and
 * `next/headers` is server-only. Import this module directly.
 */
export async function requestLocale(): Promise<Locale | null> {
  try {
    const header = (await headers()).get(LOCALE_HEADER);
    if (isLocale(header)) return header;

    // Fallback for a request the proxy did not annotate (an /api route). The
    // cookie is the only thing left that could carry an explicit choice.
    const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(cookie)) return cookie;

    return null;
  } catch {
    // No request scope. Nothing to read, and that is not an error.
    return null;
  }
}
