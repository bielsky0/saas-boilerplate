"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { LOCALE_COOKIE, type Locale, isLocale } from "./config";

/**
 * Persist an explicit language choice (spec 16.1).
 *
 * ONE DOOR, TWO PERSISTENCES, and the split is the whole design:
 *
 *   - the COOKIE is the request-time cache. The proxy reads it on every request
 *     and must never touch the database — that is what keeps it fast and
 *     edge-safe — so the preference has to be reachable without a query.
 *   - `user.locale` is the DURABLE store. A cookie is per-device and expires; an
 *     email sent on day 7 by a cron drain (§10.3) has no cookie and no request,
 *     and still has to pick a language. The row is the only thing left by then.
 *
 * Sign-in is what seeds the cookie from the row, so a user who switches language
 * on their laptop gets Polish on their phone the moment they log in there.
 *
 * Why a cookie at all when the URL already carries the locale: the URL answers
 * "what language is THIS page", not "what language does this person read".
 * Without it, a return visit to `/` re-negotiates from Accept-Language and throws
 * the choice away.
 */
export async function setLocaleAction(locale: Locale): Promise<void> {
  // Never trust a client-supplied locale: this value is written to a cookie the
  // proxy then trusts on every request, so an unvalidated string would let a
  // caller steer routing. `isLocale` is the same gate the proxy applies.
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    // No client JS reads this — the proxy does, server-side, from the request.
    httpOnly: true,
  });

  /*
   * Anonymous visitors get the cookie and nothing else: there is no row to write
   * to, and that is fine — the cookie carries them until they have an account.
   *
   * No permission check beyond "is there a session": a user setting their OWN
   * language is not a privileged action, and the id comes from the session rather
   * than from the caller, so there is no target to authorize against.
   */
  const session = await getServerSession();
  if (!session) return;

  await db.update(user).set({ locale }).where(eq(user.id, session.user.id));
}
