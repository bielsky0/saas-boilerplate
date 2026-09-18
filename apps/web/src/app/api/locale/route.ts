import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { LOCALE_COOKIE, LOCALES } from "@/lib/i18n/config";
import { env } from "@/lib/env/server";
import { apiError, invalidJson, validationFailed } from "@/lib/validation/http";

/**
 * Persist an explicit language choice (spec 16.1, faza 2.8) — the web half
 * of the locale split.
 *
 * ONE DOOR, TWO PERSISTENCES: `PATCH /v1/locale` in Nest writes the DURABLE
 * row (`user.locale` — what a day-7 cron mail reads); THIS route writes the
 * request-time cache cookie the proxy negotiates from. Each side owns its
 * write, so a future non-Next frontend keeps the row contract and brings its
 * own cookie jar.
 *
 * The cookie is deliberately NOT httpOnly: it is a client-writable preference
 * by design (the sign-in form seeds it via `document.cookie` from the stored
 * choice — an httpOnly cookie here would make that write silently lose). The
 * proxy reads it server-side either way. Anonymous callers get the cookie
 * and nothing else: no session, no row to write.
 */
const localeBodySchema = z.object({ locale: z.enum(LOCALES) });

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") return invalidJson();

  const parsed = localeBodySchema.safeParse(raw);
  if (!parsed.success) return validationFailed(parsed.error);

  // Authenticated persist: forward the browser session so Nest resolves the
  // caller. Best-effort — an anonymous switch still gets the cookie below.
  const headers = new Headers();
  headers.set("content-type", "application/json");
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  try {
    const upstream = await fetch(`${env.API_BASE_URL.replace(/\/+$/, "")}/v1/locale`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ locale: parsed.data.locale }),
    });
    // A 401 here means "no session" — exactly the anonymous case above, not
    // an error: the cookie below still applies. Anything else non-OK is a
    // genuine failure (validation already passed locally, so this is Nest
    // being unreachable or unhappy).
    if (!upstream.ok && upstream.status !== 401) {
      return apiError("Preference unavailable", 502);
    }
  } catch {
    // Nest unreachable: the cookie below still applies, and the row stays
    // unwritten until the next authenticated switch. Degraded, not broken.
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
