import { createHash } from "node:crypto";
import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";

import type { RateLimitDecision, RateLimitRule } from "@/lib/adapters/rate-limit";
import { env } from "@/lib/env/server";
import { clientIp } from "./client-ip";

/**
 * Rate-limit POLICY (spec 2.1 / 22.3) — which endpoint gets which limit, how a
 * client becomes a bucket key, and what the response headers say.
 *
 * Same role `./csp.ts` plays for the CSP: this module decides, `src/proxy.ts`
 * only attaches. It touches no database and no adapter — it maps a request to a
 * rule and a string, and the counting happens elsewhere. That split is what keeps
 * the tier table readable as a policy document rather than as plumbing.
 *
 * `node:crypto` is imported directly, which is safe because Next 16's Proxy runs
 * on the NODE.JS runtime by default (the `runtime` config option is not even
 * available in proxy files). This is the one place in the security/ directory
 * that depends on that fact; `./csp.ts` deliberately does not, so it stays usable
 * anywhere.
 */

// ─── Tiers ──────────────────────────────────────────────────────────────────

export type RateLimitTier =
  /** The credential surface: anonymous, argon2-expensive, brute-forceable (§2.1). */
  | "authCredential"
  /** Costs CPU or money per call — a signed URL, an agent turn (§22.3, §22.4). */
  | "expensive"
  /** Server actions: most mutations in this app never touch /api at all. */
  | "action"
  /** Any other non-GET /api request. */
  | "write"
  /** Any other GET /api request — "luźniejsze dla odczytu danych". */
  | "read"
  /** Not counted. Every member of this set is justified in `tierFor`. */
  | "exempt";

/**
 * The §2.1 login rule, exported because `features/auth/actions.ts` must use the
 * SAME numbers as the `authCredential` tier — two sources for one policy would
 * drift, and the drift would be invisible until someone was locked out or wasn't.
 */
export const LOGIN_RULE: RateLimitRule = {
  limit: env.RATE_LIMIT_LOGIN_ATTEMPTS,
  windowMs: env.RATE_LIMIT_LOGIN_WINDOW_S * 1000,
};

/**
 * The tier table. §22.3: "Limity zróżnicowane per typ endpointu (np. bardziej
 * restrykcyjne dla operacji kosztownych obliczeniowo/finansowo, luźniejsze dla
 * odczytu danych)."
 *
 * These four are CODE, not env, unlike the login numbers above. They are a SHAPE
 * — read looser than write, write looser than expensive — and five independent
 * environment variables give an operator five ways to produce an incoherent table
 * (a `read` limit below `write`, an `expensive` limit above `read`) with no
 * feedback that they have. The supported way to change them is to edit this
 * table under `RATE_LIMIT_MODE=report-only`, watch the logs, then enforce.
 */
export const TIERS: Record<Exclude<RateLimitTier, "exempt">, RateLimitRule> = {
  authCredential: LOGIN_RULE,
  expensive: { limit: 10, windowMs: 60_000 },
  action: { limit: 60, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  read: { limit: 120, windowMs: 60_000 },
};

/** Better Auth sub-paths that accept a credential and therefore deserve §2.1's rule. */
const CREDENTIAL_PATHS = [
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/auth/forget-password",
  "/api/auth/reset-password",
  "/api/auth/send-verification-email",
];

function byMethod(method: string): RateLimitTier {
  return method === "GET" || method === "HEAD" ? "read" : "write";
}

/**
 * Map a request to its tier. ORDER IS THE DESIGN, as in `src/proxy.ts`: this is a
 * first-match-wins list, and the exemptions have to precede the catch-alls.
 *
 * The structural property worth protecting: exemptions are ENUMERATED, and
 * everything else under /api falls through to a real limit chosen by method. A
 * route added next month is limited by default and exempting it is a deliberate
 * edit here — the same default-deny stance the proxy already takes on sessions.
 */
export function tierFor(pathname: string, method: string, isServerAction: boolean): RateLimitTier {
  /*
   * Test-only routes. 404 in production (every /api/dev route checks NODE_ENV),
   * so this exemption costs nothing where it matters — and it removes the entire
   * E2E seeding path from the limiter, which is what lets 32 parallel specs share
   * one origin without fighting over a bucket. Principled, not a test hack.
   */
  if (pathname.startsWith("/api/dev/")) return "exempt";

  /*
   * The job drain (§12). A throttled cron does not fail loudly — it silently
   * stops every retry and all scheduled work, which is the documented failure
   * mode this endpoint already has too much of (docs/ARCHITECTURE.md). An
   * unauthenticated attacker gets 401/404 after one timingSafeEqual and touches
   * no database, so there is nothing here worth counting.
   */
  if (pathname.startsWith("/api/cron/")) return "exempt";

  /*
   * ⚠️ Payment webhooks (§5.4). The sharpest conflict with §22.3's "wszystkie
   * endpointy", resolved deliberately in favour of §5.4.
   *
   * Stripe retries every non-2xx, so a 429 here is not backpressure — it is a
   * delivery failure that produces MORE traffic, and at real event volume the
   * limiter would walk the endpoint toward Stripe disabling it altogether. The
   * limiter would cause the outage it exists to prevent.
   *
   * The route is not unprotected: the HMAC signature is verified before any
   * database work, so an unsigned flood costs one hash per request. Volume
   * protection for paid operations is §22.4's budget limits, not this mechanism.
   */
  if (pathname.startsWith("/api/billing/webhook")) return "exempt";

  /*
   * Better Auth's HTTP surface is SPLIT, never blanket-limited. A flat §2.1 rule
   * across all of /api/auth would throttle get-session polling, the emailed
   * verification GET, and the MCP OAuth dance (§26), whose authorization
   * endpoints live under this prefix. Only the sub-paths that accept a credential
   * get the credential rule.
   */
  if (CREDENTIAL_PATHS.some((p) => pathname.startsWith(p))) return "authCredential";
  if (pathname.startsWith("/api/auth/")) return byMethod(method);

  /*
   * Signs a URL / runs an agent turn / creates a provider resource — §22.3's
   * "kosztownych obliczeniowo/finansowo" case.
   *
   * Checkout and portal are here rather than at the default `write` tier because
   * each one is an outbound call to the payment provider, and checkout can create
   * a customer record there. Both spend a third party's rate budget and one of
   * them leaves durable state behind, which is a different cost profile from an
   * ordinary write against our own database.
   */
  if (
    pathname.startsWith("/api/storage/presign") ||
    pathname.startsWith("/api/storage/confirm") ||
    pathname.startsWith("/api/billing/checkout") ||
    pathname.startsWith("/api/billing/portal") ||
    pathname.startsWith("/api/mcp")
  ) {
    return "expensive";
  }

  /*
   * RFC 8058 one-click unsubscribe (§10.3): limited, but deliberately at the
   * loosest tier rather than exempt. It is anonymous and it writes to the
   * database, so it needs a ceiling — but these POSTs arrive from a mail
   * provider's infrastructure, possibly many per second from a narrow IP range
   * during a campaign, and the route's own header notes the sender reads any
   * non-2xx as a broken unsubscribe. A blocked unsubscribe is a compliance
   * failure. If 429s ever appear here, raise the tier; do not exempt it.
   */
  if (pathname.startsWith("/api/unsubscribe")) return "read";

  /*
   * Server actions (§22.3 says "wszystkie endpointy API", and in this app most
   * mutations ARE server actions — they POST to a page URL and never touch /api).
   *
   * ⚠️ DEFENCE IN DEPTH ONLY. `Next-Action` is an internal Next convention and
   * may change without notice, so nothing security-critical may rest on it. In
   * particular the §2.1 login guarantee does NOT: that limit lives inside
   * `signInAction`, where it is reached by a function call rather than a header
   * sniff. See `features/auth/actions.ts`.
   */
  if (isServerAction) return "action";

  if (pathname.startsWith("/api/")) return byMethod(method);

  // Ordinary page navigations. Rate-limiting document requests would throttle a
  // user scrolling an app, and every mutation they can reach is already counted
  // as an action or an /api call above.
  return "exempt";
}

// ─── Keys ───────────────────────────────────────────────────────────────────

/**
 * ⚠️ HASHING IS MANDATORY, NOT HYGIENE. The postgres provider persists these keys
 * in a plain text column, so an unhashed key would put a live session cookie or
 * OAuth bearer token at rest in a table with no owner and no retention story.
 * 32 hex chars (128 bits) is far past collision relevance for a counter.
 */
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Per-test bucket isolation for the E2E suite.
 *
 * The suite runs `fullyParallel` against one origin with no X-Forwarded-For, so
 * without this every spec would share the `"unknown"` bucket and specs would fail
 * each other in ways that look nothing like the cause. Honouring a header is what
 * lets the tests run at PRODUCTION limits instead of relaxed ones — the
 * alternative, raising limits in CI, means never testing the real configuration.
 *
 * Guarded by NODE_ENV exactly like the /api/dev routes: in production this header
 * is ignored, so it cannot be used to escape a bucket.
 */
export const E2E_BUCKET_HEADER = "x-e2e-rate-limit-bucket";

function testBucket(headers: Headers): string {
  if (env.NODE_ENV === "production") return "";
  const bucket = headers.get(E2E_BUCKET_HEADER);
  return bucket ? `${bucket}|` : "";
}

/**
 * The bucket key for a proxied request.
 *
 * Subject precedence — session, then bearer, then IP — matters: an authenticated
 * user gets their OWN bucket, so a 300-person office behind one NAT does not
 * share a limit and one heavy user cannot lock out their colleagues. Only
 * anonymous traffic falls back to the IP, which is exactly the traffic where the
 * IP is the only identity available.
 */
export function rateLimitKey(tier: RateLimitTier, request: NextRequest): string {
  const prefix = testBucket(request.headers);

  const session = getSessionCookie(request);
  if (session) return `${tier}:session:${hash(prefix + session)}`;

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    // One misbehaving MCP agent must not throttle another behind the same egress.
    return `${tier}:bearer:${hash(prefix + authorization.slice(7))}`;
  }

  const ip = clientIp(request.headers);
  if (ip) return `${tier}:ip:${hash(prefix + ip)}`;

  /*
   * No forwarded header at all — see `clientIp`. Everyone shares one bucket.
   * That is safe (it only ever over-restricts) but coarse, and it is the state of
   * any deployment running `next start` with nothing in front of it. The operator
   * warning for that lives in docs/ARCHITECTURE.md, not in a per-request log line
   * that would fire thousands of times a second.
   */
  return `${tier}:unknown:${hash(prefix + "unknown")}`;
}

/**
 * The §2.1 bucket for the sign-in server action.
 *
 * IP-ONLY, AND NEVER KEYED ON THE SUBMITTED EMAIL — the reasoning is in
 * `features/auth/actions.ts` and it is the load-bearing half of §2.1's
 * anti-enumeration requirement. Takes plain `Headers` because a server action
 * has `headers()`, not a NextRequest.
 */
export function loginRateLimitKey(headers: Headers): string {
  const prefix = testBucket(headers);
  const ip = clientIp(headers);
  return `authCredential:ip:${hash(prefix + (ip ?? "unknown"))}`;
}

// ─── Response headers ───────────────────────────────────────────────────────

/**
 * The draft-ietf-httpapi-ratelimit-headers trio plus `Retry-After`.
 *
 * Emitted on ALLOWED responses too, not only on the 429. That is the difference
 * between a client that can back off before it is blocked and one that discovers
 * the limit by hitting it — and §22.3's requirement is that the response say when
 * to retry, which is most useful before the failure.
 *
 * `Retry-After` uses delta-seconds rather than the HTTP-date form on purpose: it
 * needs no clock agreement between server and client, and every HTTP client
 * understands it.
 */
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  const resetSeconds = Math.max(0, Math.ceil((decision.resetAt - Date.now()) / 1000));
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(resetSeconds),
  };
  if (!decision.allowed) {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
  }
  return headers;
}
