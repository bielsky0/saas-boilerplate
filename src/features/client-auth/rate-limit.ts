import { createHash } from "node:crypto";

import { rateLimit, type RateLimitRule } from "@/lib/adapters/rate-limit";
import { env } from "@/lib/env/server";
import { clientIp } from "@/lib/security/client-ip";
import { E2E_BUCKET_HEADER } from "@/lib/security/rate-limit";
import {
  OTP_ISSUE_EMAIL_RULE,
  OTP_ISSUE_IP_RULE,
  OTP_VERIFY_EMAIL_RULE,
  OTP_VERIFY_IP_RULE,
} from "./config";

/**
 * Rate-limit policy for parent authentication (langlion plan F3, spec §22.3).
 *
 * The proxy already counts every `/api` request at the `write` tier, and that is
 * not enough here for the same reason it was not enough for sign-in (§2.1): a
 * generic per-IP ceiling says nothing about how many codes ONE inbox may receive,
 * and mailing a stranger twenty codes is abuse even from twenty addresses. So
 * these limits are applied inside the handlers, reached by a function call rather
 * than by a header sniff — the property `features/auth/actions.ts` documents for
 * the login path.
 *
 * ─── TWO DIMENSIONS, AND WHY BOTH ───────────────────────────────────────────
 *
 * Per-ADDRESS is the primary limit. It is the only one an attacker cannot dilute
 * by changing networks, and it is what bounds both inbox flooding and guessing at
 * a specific parent's code.
 *
 * Per-IP is the secondary one, deliberately looser. This audience sits behind
 * shared NATs — a school, an office, a mobile carrier — so a tight IP limit
 * mostly punishes bystanders. It exists to stop one host from sweeping many
 * addresses, which the per-address rule cannot see.
 *
 * ⚠️ NEITHER IS THE LAST LINE. The adapter FAILS OPEN when its store is
 * unavailable, which is right for a login form (a password still stands behind
 * it) and wrong for a six-digit code with nothing behind it. The cap that holds
 * regardless is `client_otp.attempts`, enforced in the UPDATE itself — see
 * `registerFailedAttempt`.
 *
 * KEYS ARE HASHED, mandatorily: the postgres provider writes them to a plain text
 * column, so a bare email address here would be PII at rest in a table with no
 * owner and no retention story of its own.
 */

/** What the caller knows about who is asking. The IP may be absent; see `clientIp`. */
export interface RequestIdentity {
  ip: string | null;
  /** E2E bucket isolation, honoured outside production only. See `lib/security/rate-limit.ts`. */
  testBucket?: string | null;
}

/**
 * Read who is asking off the request headers.
 *
 * `clientIp` counts X-Forwarded-For from the RIGHT — the entry the nearest proxy
 * appended from the socket it actually accepted. Do not "unify" it with the
 * leftmost read in `features/admin/audit.ts`: that one is evidence, this one is a
 * control, and the leftmost entry is whatever the client typed.
 */
export function identityFrom(headers: Headers): RequestIdentity {
  return { ip: clientIp(headers), testBucket: headers.get(E2E_BUCKET_HEADER) };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function prefixOf(identity: RequestIdentity): string {
  if (env.NODE_ENV === "production") return "";
  return identity.testBucket ? `${identity.testBucket}|` : "";
}

/**
 * The address bucket is keyed on `(organizationId, email)` — the identity the
 * code itself is scoped to. Keying on the bare email would let one parent's
 * activity at Academy A throttle a different person who happens to share the
 * address at Academy B, which is precisely the coupling rewizja 14.1 removed.
 */
function emailKey(
  action: string,
  organizationId: string,
  email: string,
  identity: RequestIdentity,
): string {
  return `clientOtp:${action}:email:${hash(`${prefixOf(identity)}${organizationId}:${email}`)}`;
}

function ipKey(action: string, identity: RequestIdentity): string {
  return `clientOtp:${action}:ip:${hash(`${prefixOf(identity)}${identity.ip ?? "unknown"}`)}`;
}

export interface RateLimited {
  status: "rate_limited";
  retryAfterSeconds: number;
}

/**
 * Count one hit against both buckets and refuse if EITHER is exhausted.
 *
 * Both are consumed even when the first already refuses. Short-circuiting would
 * let an attacker who has burned the address limit keep making free requests
 * against the IP one, and the two counters would then disagree about how much
 * traffic there was.
 */
async function consumeBoth(
  action: string,
  organizationId: string,
  email: string,
  identity: RequestIdentity,
  emailRule: RateLimitRule,
  ipRule: RateLimitRule,
): Promise<RateLimited | null> {
  const [byEmail, byIp] = await Promise.all([
    rateLimit.consume(emailKey(action, organizationId, email, identity), emailRule),
    rateLimit.consume(ipKey(action, identity), ipRule),
  ]);

  if (byEmail.allowed && byIp.allowed) return null;

  return {
    status: "rate_limited",
    retryAfterSeconds: Math.max(
      byEmail.allowed ? 0 : byEmail.retryAfterSeconds,
      byIp.allowed ? 0 : byIp.retryAfterSeconds,
    ),
  };
}

export function issueLimitDecision(
  organizationId: string,
  email: string,
  identity: RequestIdentity,
): Promise<RateLimited | null> {
  return consumeBoth(
    "issue",
    organizationId,
    email,
    identity,
    OTP_ISSUE_EMAIL_RULE,
    OTP_ISSUE_IP_RULE,
  );
}

export function verifyLimitDecision(
  organizationId: string,
  email: string,
  identity: RequestIdentity,
): Promise<RateLimited | null> {
  return consumeBoth(
    "verify",
    organizationId,
    email,
    identity,
    OTP_VERIFY_EMAIL_RULE,
    OTP_VERIFY_IP_RULE,
  );
}
