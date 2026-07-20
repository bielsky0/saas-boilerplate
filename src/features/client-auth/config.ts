import type { RateLimitRule } from "@/lib/adapters/rate-limit";

/**
 * The numbers behind parent authentication (langlion §2.19, plan F3 / D37, D38).
 *
 * Gathered in one file because several of them are load-bearing in pairs, and a
 * pair that drifts is a bug nobody sees: `OTP_TTL_MS` bounds how long a code is
 * guessable, and `OTP_MAX_ATTEMPTS` bounds how many guesses fit inside it. Read
 * together they say "at most 5 tries at a 1-in-a-million code within 15 minutes".
 * Read apart, either one looks arbitrary.
 *
 * CODE, NOT ENV, following the tier table in `lib/security/rate-limit.ts`: these
 * are a shape rather than a deployment knob, and an operator given five variables
 * has five ways to produce an incoherent one with no feedback that they have.
 */

/** Six digits. Short enough to read off a phone, and bounded by the guess cap. */
export const OTP_LENGTH = 6;

/**
 * 15 minutes (plan F3). Long enough to survive a slow mail hop, short enough that
 * a code sitting in an unattended inbox stops mattering quickly.
 */
export const OTP_TTL_MS = 15 * 60 * 1000;

/**
 * Guesses per code before it is burned, enforced on the ROW.
 *
 * ⚠️ This is the cap that actually holds. The rate limiter in front of it fails
 * open when its store is unavailable (see the adapter contract), which is the
 * right call for a password form — argon2 still runs underneath — and the wrong
 * one here, where the six digits ARE the whole credential.
 */
export const OTP_MAX_ATTEMPTS = 5;

/**
 * 30 days, refreshed on use (D37).
 *
 * Long because of who this is for: a parent returns to add a session, enrol a
 * second child, or sign up for a new term — a rhythm measured in weeks. A 24-hour
 * session would mean an emailed code at nearly every visit, which is friction on
 * the exact path EPIK 4 exists to keep short.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Only refresh a session that has gone unused for a day.
 *
 * Sliding expiry without a threshold means a write on every page view: a lookup
 * becomes an UPDATE, and the session table lands on the hot write path. The cost
 * of the threshold is that a session can expire up to a day "early" relative to
 * true last use, which no one can perceive against a 30-day window.
 */
export const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** The cookie carrying the opaque session token. Value is a random token, never a claim. */
export const CLIENT_SESSION_COOKIE = "ll_client_session";

/**
 * Per-address limits. Keyed on `(organizationId, email)` — the identity the code
 * is scoped to — so flooding one parent's inbox cannot be spread across IPs, and
 * one parent hitting a limit cannot affect another.
 */
export const OTP_ISSUE_EMAIL_RULE: RateLimitRule = { limit: 5, windowMs: 15 * 60 * 1000 };
export const OTP_VERIFY_EMAIL_RULE: RateLimitRule = { limit: 10, windowMs: 15 * 60 * 1000 };

/**
 * Per-IP limits, deliberately looser than the per-address ones.
 *
 * A shared NAT is the normal case for this audience — a school, an office, a
 * mobile carrier — so the IP is a poor identity and a tight limit here punishes
 * bystanders. It is the second dimension, not the primary one: the per-address
 * rule is what bounds abuse of any single account.
 */
export const OTP_ISSUE_IP_RULE: RateLimitRule = { limit: 20, windowMs: 15 * 60 * 1000 };
export const OTP_VERIFY_IP_RULE: RateLimitRule = { limit: 40, windowMs: 15 * 60 * 1000 };
