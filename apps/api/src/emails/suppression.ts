import { createHmac, timingSafeEqual } from "node:crypto";

import type { SuppressibleCategory } from "./categories";
import { isSuppressibleCategory } from "./categories";

/**
 * Unsubscribe link signing (spec 10.3) — the Nest twin of web's
 * `features/emails/suppression.ts`.
 *
 * HMAC RATHER THAN A DB TOKEN: the link must work indefinitely (RFC 8058 —
 * including from a three-year-old archive), and a DB token invites a TTL plus
 * one row per recipient (and cannot exist at all for invitees with no
 * account). The cost is no revocation: rotating the secret invalidates every
 * link already in an inbox, which is why `EMAIL_UNSUBSCRIBE_SECRET` exists
 * separately from `BETTER_AUTH_SECRET`.
 *
 * Secrets and the web origin arrive as ARGUMENTS (from `ApiConfig`), never
 * from ambient env: this module runs in handlers and controllers alike, and
 * ambient reads would split the signing identity by call site.
 */

export function signingSecret(unsubscribeSecret: string | undefined, authSecret: string): string {
  return unsubscribeSecret ?? authSecret;
}

function mac(
  email: string,
  category: SuppressibleCategory,
  unsubscribeSecret: string | undefined,
  authSecret: string,
): string {
  return (
    createHmac("sha256", signingSecret(unsubscribeSecret, authSecret))
      // Versioned + field-separated: the prefix lets a future format change be
      // distinguished rather than silently reinterpreted, and the separators
      // stop ("ab","c") and ("a","bc") from producing the same signature.
      .update(`unsub:v1:${email.toLowerCase()}:${category}`)
      .digest("base64url")
  );
}

export interface UnsubscribeToken {
  email: string;
  category: SuppressibleCategory;
}

export interface SuppressionConfig {
  unsubscribeSecret: string | undefined;
  authSecret: string;
  /** Web origin — links land on pages, never on the API. */
  webAppUrl: string;
}

/** Build the signed, session-free unsubscribe URL for one address + category. */
export function unsubscribeUrl(
  email: string,
  category: SuppressibleCategory,
  config: SuppressionConfig,
): string {
  const params = new URLSearchParams({
    e: Buffer.from(email.toLowerCase()).toString("base64url"),
    c: category,
    t: mac(email, category, config.unsubscribeSecret, config.authSecret),
  });
  return `${config.webAppUrl.replace(/\/+$/, "")}/unsubscribe?${params.toString()}`;
}

/** The RFC 8058 one-click endpoint, used in the List-Unsubscribe header. */
export function unsubscribePostUrl(
  email: string,
  category: SuppressibleCategory,
  config: SuppressionConfig,
): string {
  return unsubscribeUrl(email, category, config).replace("/unsubscribe?", "/api/unsubscribe?");
}

/**
 * Verify a link's parameters. Returns null for anything that does not check
 * out — callers must not distinguish "bad signature" from "malformed", since
 * neither is actionable by the recipient.
 */
export function verifyUnsubscribeToken(
  e: string | null,
  c: string | null,
  t: string | null,
  config: Pick<SuppressionConfig, "unsubscribeSecret" | "authSecret">,
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

  const expected = Buffer.from(mac(email, c, config.unsubscribeSecret, config.authSecret));
  const actual = Buffer.from(t);
  // Length check first: timingSafeEqual THROWS on a length mismatch, and `===`
  // on a signature is a timing oracle.
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  return { email, category: c };
}

/**
 * The List-Unsubscribe headers (RFC 2369 + RFC 8058). Only for suppressible
 * categories: on a password reset an unsubscribe affordance is wrong, and
 * Gmail renders one if the header is present.
 */
export function unsubscribeHeaders(
  email: string,
  category: SuppressibleCategory,
  config: SuppressionConfig,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribePostUrl(email, category, config)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
