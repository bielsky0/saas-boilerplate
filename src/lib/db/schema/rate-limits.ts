import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Rate-limit counters (spec 2.1 / 22.3 — brute-force and flood protection).
 *
 * Written ONLY by `src/lib/adapters/rate-limit/postgres.ts`, which exists so that
 * N application instances share one counter. See that file for why every
 * timestamp is computed with the database's `now()` and why `consume` is a single
 * upsert rather than a read-modify-write.
 *
 * TENANT-ISOLATION CARVE-OUT (spec 1.3 / 11.2) — see schema/index.ts. Both halves
 * hold, and for the `email_suppression` reasons rather than the `job` ones:
 *   - the subject is a CLIENT IDENTIFIER, not a tenant record. One key may map to
 *     no user at all (an anonymous sign-in attempt) and, behind a shared NAT, to
 *     several tenants at once. Scoping a counter per organization would mean an
 *     attacker gets a fresh allowance for every tenant they can name, which
 *     inverts the point of the table;
 *   - its access boundary is that NO FEATURE CODE READS IT. The only readers are
 *     the proxy chokepoint and the sign-in action; the only writer is the adapter.
 *     There is no owner filter to enforce because there is no owner-scoped query.
 *
 * ⚠️ `key` IS A HASH, NEVER A RAW CREDENTIAL. The bucket subject is a session
 * cookie, an OAuth bearer token or an IP — so storing it verbatim would put live
 * credentials at rest in a table with no owner column and no retention story of
 * its own. `rateLimitKey` in src/lib/security/rate-limit.ts is the only thing that
 * should construct one, and it hashes. Do not "simplify" it into storing the
 * email address on the login path either: that would make this table a register
 * of who tried to sign in.
 *
 * Rows are self-expiring — an expired row is reset by the next `consume` rather
 * than read, so correctness never depends on the sweep. The `ratelimit.prune`
 * cron job (§12.1) only reclaims disk from keys that stopped being hit, and runs
 * HOURLY rather than daily because these rows are short-lived and numerous.
 */
export const rateLimit = pgTable(
  "rate_limit",
  {
    /** `${tier}:${subjectKind}:${sha256(subject)}` — pre-hashed by the caller. */
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    /** End of the current fixed window. Set from the DATABASE clock, never Node's. */
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (t) => [index("rate_limit_expires_idx").on(t.expiresAt)],
);
