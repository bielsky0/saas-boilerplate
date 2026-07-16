import { createHmac, timingSafeEqual } from "node:crypto";

import { clientEnv } from "@/lib/env/client";
import { env } from "@/lib/env/server";
import type { SuppressibleCategory } from "./categories";
import { isSuppressibleCategory } from "./categories";

/**
 * Unsubscribe link signing (spec 10.3).
 *
 * HMAC RATHER THAN A DB TOKEN, and the deciding property is NO EXPIRY. RFC 8058
 * and every mail client require an unsubscribe link to work indefinitely —
 * including from a three-year-old archive — and a DB token invites a TTL, which
 * makes an expired unsubscribe link a compliance defect. A DB token would also
 * need one row per recipient per email (write amplification plus a cleanup job),
 * and could not exist at all for invitation recipients who have no account.
 *
 * The cost is the inverse: these links cannot be revoked, and rotating the
 * signing secret invalidates every link already sitting in an inbox. That is why
 * EMAIL_UNSUBSCRIBE_SECRET exists separately from BETTER_AUTH_SECRET — see its
 * comment in lib/env/server.ts.
 */

/**
 * Falls back to the session secret so the boilerplate needs zero extra config;
 * the env comment explains the rotation constraint that inherits.
 */
function signingSecret(): string {
  return env.EMAIL_UNSUBSCRIBE_SECRET ?? env.BETTER_AUTH_SECRET;
}

function mac(email: string, category: SuppressibleCategory): string {
  return (
    createHmac("sha256", signingSecret())
      // Versioned + field-separated: the prefix lets a future format change be
      // distinguished rather than silently reinterpreted, and the separators stop
      // ("ab","c") and ("a","bc") from producing the same signature.
      .update(`unsub:v1:${email.toLowerCase()}:${category}`)
      .digest("base64url")
  );
}

export interface UnsubscribeToken {
  email: string;
  category: SuppressibleCategory;
}

/** Build the signed, session-free unsubscribe URL for one address + category. */
export function unsubscribeUrl(email: string, category: SuppressibleCategory): string {
  const params = new URLSearchParams({
    e: Buffer.from(email.toLowerCase()).toString("base64url"),
    c: category,
    t: mac(email, category),
  });
  return `${clientEnv.NEXT_PUBLIC_APP_URL}/unsubscribe?${params.toString()}`;
}

/** The RFC 8058 one-click endpoint, used in the List-Unsubscribe header. */
export function unsubscribePostUrl(email: string, category: SuppressibleCategory): string {
  return unsubscribeUrl(email, category).replace("/unsubscribe?", "/api/unsubscribe?");
}

/**
 * Verify a link's parameters. Returns null for anything that does not check out —
 * callers must not distinguish "bad signature" from "malformed", since neither is
 * actionable by the recipient.
 */
export function verifyUnsubscribeToken(
  e: string | null,
  c: string | null,
  t: string | null,
): UnsubscribeToken | null {
  if (!e || !c || !t) return null;
  if (!isSuppressibleCategory(c)) return null;

  let email: string;
  try {
    email = Buffer.from(e, "base64url").toString("utf8").toLowerCase();
  } catch {
    return null;
  }
  if (!email.includes("@")) return null;

  const expected = Buffer.from(mac(email, c));
  const actual = Buffer.from(t);
  // Length check first: timingSafeEqual THROWS on a length mismatch, and `===`
  // on a signature is a timing oracle.
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  return { email, category: c };
}

/**
 * The List-Unsubscribe headers (RFC 2369 + RFC 8058).
 *
 * Only for suppressible categories: on a password reset an unsubscribe
 * affordance is wrong, and Gmail will render one if the header is present.
 */
export function unsubscribeHeaders(
  email: string,
  category: SuppressibleCategory,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribePostUrl(email, category)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
