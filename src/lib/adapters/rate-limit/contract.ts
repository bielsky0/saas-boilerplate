/**
 * Rate-limit contract (spec 1.2, 2.1, 22.3 — pluggable counter store).
 *
 * Fifth reference adapter alongside `../auth`, `../billing`, `../email` and
 * `../storage`. Callers depend ONLY on this interface; the concrete provider is
 * chosen at startup by `RATE_LIMIT_PROVIDER` in `./index.ts`.
 *
 * What it demonstrates that the other four do not: an adapter whose operation
 * must be ATOMIC rather than transactional. The jobs adapter takes a `writer` so
 * an enqueue can join the caller's transaction; a counter cannot work that way,
 * because two requests racing toward the same limit must serialise against each
 * other, not against some caller's unrelated business write. So there is no
 * `writer` parameter here and the postgres provider is one statement, never a
 * read-modify-write.
 *
 * ─── `peek` IS NOT A CONVENIENCE ────────────────────────────────────────────
 *
 * The login path (§2.1) must decide whether to proceed BEFORE the password is
 * verified, because that argon2 hash IS the expensive work an attacker is trying
 * to make us do. A limiter that verifies first and counts afterwards has spent
 * exactly the resource it exists to protect. `consume` then runs only on an
 * actual failure. Two methods, because those are two genuinely different moments.
 *
 * ─── FIXED WINDOW, AND WHAT IT COSTS ────────────────────────────────────────
 *
 * A client can send `limit` hits at the end of one window and `limit` more at the
 * start of the next: `2 x limit` across the boundary. That is accepted, not
 * overlooked. This is abuse mitigation, not the §5.6 quota system — a quota bills
 * someone and must be exact, a limiter only has to make brute force impractical,
 * and 10 guesses per 15 minutes instead of 5 is still impractical. A sliding
 * window (or GCRA) belongs to the future `redis` provider, where the primitives
 * for it are cheap.
 *
 * ─── ⚠️ THIS ADAPTER FAILS OPEN ─────────────────────────────────────────────
 *
 * If the store throws, `consume` and `peek` return `allowed: true` and log at
 * warn. This is the same stance `src/proxy.ts` takes on the session guard — "a
 * UX convenience, NOT the security boundary" — and the reasoning is the same
 * shape: failing closed turns a transient database blip into a total outage of
 * every endpoint at once, which is a worse incident than the one being prevented.
 * On the login path specifically, failing open loses throttling but admits
 * NOBODY, because the credential check still runs underneath it.
 *
 * The default provider is `memory`, which cannot throw, so this branch exists
 * only for `postgres`.
 *
 * ─── KEYS ARE OPAQUE AND MUST ARRIVE PRE-HASHED ─────────────────────────────
 *
 * The postgres provider writes keys to a plain text column. A raw session cookie,
 * OAuth bearer token or bare email address in a key would therefore be a
 * credential (or PII) at rest in a table with no owner column and no retention
 * story of its own. Hashing is the caller's job — see `rateLimitKey` in
 * src/lib/security/rate-limit.ts, which is the only thing that should build one.
 */

/** At most `limit` hits per `windowMs`. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  /** Hits left in the current window. 0 when blocked. */
  remaining: number;
  /**
   * ABSOLUTE epoch-ms when the window resets — never a duration.
   *
   * A duration would force every caller to re-derive the clock, and the postgres
   * provider's clock is the DATABASE's, not this process's. Returning an absolute
   * instant means the answer is already correct in whichever clock produced it.
   */
  resetAt: number;
  /** `ceil((resetAt - now) / 1000)`, floored at 1. Meaningful when `!allowed`. */
  retryAfterSeconds: number;
}

export interface RateLimitAdapter {
  /** Count one hit against `key`. MUST be atomic — one statement, no read-modify-write. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
  /**
   * Decide WITHOUT counting — specifically, whether the NEXT hit would be
   * allowed. See the `peek` note in this file's header, and `decideNext` for why
   * that is a different question from the one `consume` answers.
   */
  peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
  /** Drop a key's counter — a successful sign-in clears its own failure bucket. */
  reset(key: string): Promise<void>;
  /** Delete expired entries, returning the count. Memory prunes lazily and returns 0. */
  prune(): Promise<number>;
}

function retryAfter(resetAt: number): number {
  // Floored at 1: `Retry-After: 0` invites an immediate retry, which is the
  // opposite of what the header is for.
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

/**
 * Decision for a hit that HAS been recorded. `count` includes it.
 *
 * Shared by both providers so the two cannot disagree about what "remaining"
 * means or how `retryAfterSeconds` rounds.
 */
export function decide(count: number, resetAt: number, rule: RateLimitRule): RateLimitDecision {
  return {
    // `<=`, because `count` INCLUDES the hit being judged: the 5th of 5 is the
    // last allowed one, not the first refused one.
    allowed: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt,
    retryAfterSeconds: retryAfter(resetAt),
  };
}

/**
 * Decision for a hit that has NOT happened yet — what `peek` answers.
 *
 * ⚠️ THE COMPARISON IS STRICT, AND THAT IS THE WHOLE POINT OF A SECOND FUNCTION.
 * `decide` judges the hit already counted; `peek` judges the NEXT one. Reusing
 * `decide` here reads `count === limit` as "allowed" — true of the hit that just
 * happened, false of the one about to — and the limit then fires one attempt
 * late: five failed sign-ins with a limit of five would leave the sixth still
 * asking the auth engine.
 *
 * `remaining` needs no such adjustment: "how many more are permitted" is
 * `limit - count` from either side of the fence.
 */
export function decideNext(count: number, resetAt: number, rule: RateLimitRule): RateLimitDecision {
  return {
    allowed: count < rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt,
    retryAfterSeconds: retryAfter(resetAt),
  };
}

/** The answer both providers give when the store is unavailable. See the fail-open note. */
export function allowOnError(rule: RateLimitRule): RateLimitDecision {
  return {
    allowed: true,
    limit: rule.limit,
    remaining: rule.limit,
    resetAt: Date.now() + rule.windowMs,
    retryAfterSeconds: 1,
  };
}
