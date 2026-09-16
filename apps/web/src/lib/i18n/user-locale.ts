import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { DEFAULT_LOCALE, type Locale, isLocale } from "./config";

/**
 * "What language does this person read?" (spec 16.1)
 *
 * THE ENQUEUE-TIME ANSWER. Email is sent by a cron drain — for the §10.3
 * sequence, up to a week after the request that triggered it — so there is no
 * cookie, no `Accept-Language` and no request scope at render time. The locale has
 * to be resolved while a caller still knows who it is for, and carried in the job
 * payload. These are the functions that resolve it.
 *
 * Deliberately NOT exported from `./index.ts`: that barrel re-exports next-intl's
 * navigation (a client component), and this module imports the database. Keeping
 * them apart is what stops a client component that wanted `<Link>` from dragging
 * Drizzle into the browser bundle. Import this module directly.
 *
 * Reading `user` is not a tenant-isolation breach: it is one of the documented
 * identity-table carve-outs (see db/schema/index.ts), and a locale lookup is
 * keyed by the identity itself, not by an owner.
 */

/**
 * ─── Two shapes, and mixing them up is the bug this comment exists to prevent ──
 *
 * `stored*` returns `Locale | null` and PRESERVES "never chose". `localeFor*`
 * collapses that to a renderable default.
 *
 * Both are needed because the two callers ask different questions:
 *   - sign-in asks "did this person choose?" — because the answer decides whether
 *     to override their browser. Collapsing null to "en" there would fabricate a
 *     preference and then let it outrank a browser setting the user actually
 *     changed.
 *   - an email asks "what do I write this in?" — there is no null answer to that;
 *     something has to be rendered.
 *
 * Use the narrowest one that answers your question.
 */

/**
 * Narrow whatever is in the column to a locale we can actually render.
 *
 * The column is plain `text` so adding a language needs no migration, which means
 * a value can outlive the locale it names: remove `pl` from LOCALES and every
 * Polish user's row still says "pl". Falling back beats throwing — a stale
 * preference should cost the reader English, not a failed send.
 */
export function toLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

async function readLocale(where: ReturnType<typeof eq>): Promise<string | null> {
  const [row] = await db.select({ locale: user.locale }).from(user).where(where).limit(1);
  return row?.locale ?? null;
}

/** The user's stored choice, or null if they never made one. */
export async function storedLocaleForUser(userId: string): Promise<Locale | null> {
  const value = await readLocale(eq(user.id, userId));
  return isLocale(value) ? value : null;
}

/**
 * Same, by email — for sign-in, which knows the address but must NOT read the
 * session.
 *
 * `getServerSession()` cannot help here: `headers()` returns the REQUEST headers
 * for the whole request, and the session cookie the engine just minted only exists
 * on the RESPONSE. Reading the session immediately after sign-in therefore sees
 * the anonymous request that started it. (The same header/cookie asymmetry that
 * `features/admin/audit.ts` documents for impersonation, arriving from the other
 * direction.)
 */
export async function storedLocaleForEmail(email: string): Promise<Locale | null> {
  const value = await readLocale(eq(user.email, email));
  return isLocale(value) ? value : null;
}

/**
 * The language to WRITE TO this user in — the enqueue-time answer for email.
 *
 * Never null: a message has to be in some language, and the default is the honest
 * choice for someone who never told us.
 */
export async function localeForUser(userId: string): Promise<Locale> {
  return (await storedLocaleForUser(userId)) ?? DEFAULT_LOCALE;
}
