### Row-Level Security (spec §1.3, US-1.1)

Two groups of tables carry RLS policies keyed on per-transaction settings:

| Group              | Tables                                                                                             | Owner shape                          |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| langlion core (F0) | `location`, `group_type`, `group_type_recurrence`, `class_session`, `client`, `athlete`, `booking` | NOT NULL `organizationId`            |
| boilerplate (F1a)  | `membership`, `invitation`                                                                         | NOT NULL `organizationId`            |
| boilerplate (F1a)  | `file`, `notification`                                                                             | `organizationId` **XOR** `accountId` |
| billing (F1b)      | `billing_customer`, `subscription`, `billing_payment`, `webhook_event`                             | `organizationId` **XOR** `accountId` |

All access goes through one of two functions:

```ts
import { withOwner, withTenant } from "@/lib/db/tenant";

// Organization-owned (the langlion shape, and most boilerplate reads):
await withTenant(ctx.org.id, async (tx) => listLocations(tx, ctx.org.id));

// Either owner shape — an org, or someone's personal account:
await withOwner(owner, async (tx) => listFilesForOwner(tx, owner));
```

`withTenant` is a thin alias for `withOwner({ kind: "organization", … })`.

**Two GUCs, both always written.** `withOwner` sets `app.organization_id` and
`app.account_id` on every call, blanking the inactive one. This is not tidiness:
`db.transaction` inside an open transaction opens a SAVEPOINT, not a new
transaction, and a transaction-scoped `set_config` survives its release — so a
wrapper that set only its own GUC would leave the other holding the enclosing
scope's value, and the inner query would satisfy both policy disjuncts at once.

**The XOR policy and three-valued logic.** For an org-owned row `accountId` IS
NULL, so the account disjunct evaluates to NULL: `true OR NULL` = true (allow),
`false OR NULL` = NULL (deny), `NULL OR NULL` = NULL (deny — the no-context case,
failing closed). The XOR CHECK guarantees one column is non-NULL, so no row is
unreachable.

#### What is deliberately NOT under RLS

| Table                                          | Why                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organization`, `personal_account`             | The owner TARGETS. A policy keyed on the owner cannot apply to the row that DEFINES the owner — the query resolving it is the query producing the GUC value. |
| `notification_preference`                      | Keyed on the user, not an owner. A **recorded deviation**, not a clean carve-out — see its schema header.                                                    |
| `audit_log`                                    | Nullable owner by design; a standard policy would refuse every system-actor row. If ever added, it needs an explicit `OR "organizationId" IS NULL` branch.   |
| auth, `job`, `email_suppression`, `rate_limit` | System tables — see the carve-out rule in `schema/index.ts`.                                                                                                 |

`e2e/boilerplate-rls.spec.ts` asserts these NEGATIVELY (`relrowsecurity = false`).
Enabling RLS on `notification_preference` without a user GUC would make every
preference invisible and silently stop in-app suppression working — that
assertion turns it into a red test rather than a support ticket.

#### Deploying an RLS migration

**The migration is a switch, and the code must land first.** The asymmetry is the
whole reason an order exists:

| Order               | Window                        | Effect                                                                                                                                |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **migration first** | until traffic fully cuts over | old code reads `membership` with no context → zero rows → `forbidden()`. **Total outage**, every tenant, no partial-degradation mode. |
| **code first**      | until `db:migrate` runs       | new code sets two GUCs no table reads yet. **No behaviour change.**                                                                   |

This matters in production because **`db:migrate` is not part of the deploy**:
`build` is `next build`, the only automated run is in CI against an ephemeral
database, and Vercel cuts traffic over gradually. So the order is guaranteed by
operator discipline, not by tooling. Runbook:

1. Deploy the code. **Do not migrate.**
2. Confirm the new version serves 100% of traffic and no old instance is alive.
3. Run the data gate (below), then `pnpm db:migrate` on `DATABASE_MIGRATION_URL`.
4. Verify: `SELECT tablename, policyname FROM pg_policies …` plus a smoke test on
   one org page.

**Rolling back after step 3 is a FORWARD migration** (`DROP POLICY` + `DISABLE ROW
LEVEL SECURITY`), never a code revert — reverting code under live policies
recreates the "migration first" row above.

> ⚠️ **Blocking before the first multi-instance production deploy:** either
> automate the migration step so it runs after full promotion, or accept this as a
> written manual procedure. Today nothing enforces it.

**The data gate.** Before enabling `FORCE` on a table, verify on real data that
every row has an owner — a row without one becomes silently invisible rather than
an error:

```sql
SELECT count(*) FROM "notification" WHERE "organizationId" IS NULL AND "accountId" IS NULL;
```

Run it as the **owner role** and **before** the migration. On `DATABASE_URL` after
the fact it returns 0 regardless — those are exactly the rows the policy hides.

Two companion queries, both added in F1b after the ownerless count turned out to
be the least informative of the three:

```sql
-- 2. Is the XOR CHECK actually what makes that zero true? A constraint dropped or
-- added NOT VALID at some point turns query 1 from a formality back into the
-- real check. Expect one validated row per table.
SELECT conrelid::regclass, conname, convalidated
FROM pg_constraint WHERE contype = 'c' AND conname LIKE '%\_owner\_ck';

-- 3. Owner AGREEMENT — no constraint enforces this one. A row whose owner
-- disagrees with the billing_customer it points at becomes a permanent provider
-- retry loop the first time a fresh event touches it (see below). Expect zero.
SELECT s.id FROM subscription s JOIN billing_customer c ON c.id = s."billingCustomerId"
WHERE s."organizationId" IS DISTINCT FROM c."organizationId"
   OR s."accountId" IS DISTINCT FROM c."accountId";
```

Also read the **distribution**, not just the zero. In F1a, 110 of 118
`notification` rows were account-owned, which is why the policy needed a second
disjunct at all; in F1b all four billing tables had _zero_ account-owned rows,
which is why those e2e tests seed their own rather than trusting dev data.

#### RLS and `ON CONFLICT`

Postgres treats the two conflict actions differently under RLS, and the
difference is load-bearing for every upsert-shaped webhook (`billing/webhooks.ts`
today; the plan's F9 plan-id mapping, F11/F12 credit webhooks and F16 refunds are
all the same shape). Measured on this Postgres, and consistent with the
`CREATE POLICY` docs:

| Statement                                            | Conflicting row invisible under `USING`     |
| ---------------------------------------------------- | ------------------------------------------- |
| `ON CONFLICT DO NOTHING`                             | silent no-op, no row returned, **no error** |
| `ON CONFLICT DO UPDATE`                              | **raises `42501`**                          |
| `ON CONFLICT DO UPDATE` whose `setWhere` fails first | no row returned, **no error**               |

`DO NOTHING` evaluates only the INSERT `WITH CHECK` — the docs say it checks it
"for all rows proposed for insertion, regardless of whether or not they end up
being inserted" — so an idempotency marker keyed on a unique index behaves
exactly as it did before RLS.

`DO UPDATE` is the opposite: "unlike a standalone UPDATE command, if the existing
row does not pass the USING expressions, an error will be thrown (the UPDATE path
will never be silently avoided)." For a webhook that derives its owner from a
lookup, this converts a silent cross-tenant overwrite into a loud failure. Worth
the trade, but note the asymmetry: `setWhere` is evaluated **before** the `USING`
check, so a _stale_ event with the same owner mismatch is swallowed as stale. The
error is therefore not a reliable detector of the condition — gate query 3 above
is.

`e2e/boilerplate-rls.spec.ts` pins the `DO UPDATE` case via the probe's `upsert`
action; the `DO NOTHING` case is pinned end-to-end by the duplicate-delivery
tests in `e2e/billing-webhook.spec.ts`.

**RLS is the second line, not the first.** `data.ts` functions still take an
explicit `organizationId` and still filter by it. That filter is what uses the
index, and US-1.1/AC1 is about isolation holding on the day someone forgets it —
a policy that is never load-bearing is a policy nobody notices has broken. The
apparent redundancy is the point.

`data.ts` functions take a `TenantDb` rather than reaching for `db`, so calling
one outside a tenant context is a compile error. The rejected alternative was
ambient context via `AsyncLocalStorage` (the shape `src/lib/logger.ts` uses): a
forgotten `withTenant` would then degrade to an empty result set, which is
indistinguishable from "no rows matched".

To cross tenants deliberately, use `withSystemBypass(reason, fn)` from
`@/lib/db/system`. It is fenced by `no-restricted-imports`, so every consumer is
listed in `eslint.config.mjs` and "who can read everything?" stays greppable.

#### Objects Drizzle cannot see

Three kinds of database object in this schema exist only in hand-written
migration SQL and are absent from `migrations/meta/*_snapshot.json`:

| Object                                    | Where                             |
| ----------------------------------------- | --------------------------------- |
| `EXCLUDE` constraints (§5.1, §5.3)        | `0014_lively_sumo.sql`            |
| RLS policies + `FORCE` (langlion core)    | `0015_rls_langlion_core.sql`      |
| RLS policies + `FORCE` (boilerplate, F1a) | `0016_rls_boilerplate_tenant.sql` |
| RLS policies + `FORCE` (billing, F1b)     | `0017_rls_billing.sql`            |
| `GRANT`s, `ALTER DEFAULT PRIVILEGES`      | `0012_grant_app_role.sql`         |

This is safe in one direction and dangerous in the other. `drizzle-kit generate`
diffs the TS schema against the snapshot, never against the live database, so it
cannot propose dropping what it cannot see.

> **`drizzle-kit push` is banned.** Unlike `generate`, it introspects the live
> database, so it would see these objects as drift and propose dropping them —
> silently taking tenant isolation and the concurrency guards with it. There is
> deliberately no `db:push` script. Do not add one.

The remaining hazard is a future migration that `ALTER`s the **type** of a column
participating in an `EXCLUDE`; it will either fail or drop the constraint by
cascade. The affected columns are listed by name in the headers of
`schema/class-sessions.ts` and `schema/bookings.ts`.

#### Adding a table to the langlion domain

1. Give it a NOT NULL `organizationId` and an index on it.
2. Add `UNIQUE (id, organizationId)` — it is the target every composite foreign
   key in this domain points at, which is what makes "the child belongs to the
   parent's academy" structural rather than a rule to remember.
3. Add `ENABLE` + `FORCE ROW LEVEL SECURITY` and both policies, copying
   `0015_rls_langlion_core.sql`. Without `FORCE`, the owner is exempt.
4. **Check the export name is not already taken.** `export *` from two schema
   modules exporting the same binding is not an error — the name becomes
   ambiguous and is silently omitted, and `drizzle-kit` then skips your table
   while still emitting foreign keys against the _other_ table of that name. This
   already happened once: the spec's `session` collides with Better Auth's, hence
   `class_session`.

With `EMAIL_PROVIDER=log` (the default) no mail is sent — sign up and the
verification link is printed to the server console (and captured in-process for
the E2E tests via `/api/dev/emails`). E2E: `pnpm exec playwright install chromium`
once, ensure the DB is migrated, then `pnpm test:e2e`.

> **E2E footgun:** `playwright.config.ts` sets `reuseExistingServer` outside CI,
> so an app you already have running on :3000 is reused — without the env
> `webServer.env` would have supplied. The billing webhook tests then hit a
> server with `BILLING_PROVIDER` unset and fail with a 404 that looks nothing
> like the cause. Stop your dev server first, or run the suite on another port
> (`PORT=3100 NEXT_PUBLIC_APP_URL=http://localhost:3100 pnpm test:e2e`).
> These specs also share one database with no teardown, so every test must mint
> unique data (`uniqueEmail()`, a unique org slug) or parallel workers race onto
> the same unique constraint. This bites hardest on the **admin panel specs**:
> `/admin/users` and `/admin/audit` are global by design, so they contain every
> parallel worker's rows. Assert by filtering on a `uniqueEmail()` (`?q=…`) —
> never by list position or "the first row".
>
> **The content specs (§8/§9) are the exception, and say so in their own JSDoc.**
> `seo-sitemap`, `seo-metadata` and `content-no-js` touch no database and hold no
> session: their fixtures are the boilerplate's own example posts, which are
> stable by design. Do not add `uniqueEmail()` there out of habit. Two of them
> read `src/content/` from disk on purpose — fs is free in a test runner, and it
> is what catches a post whose registry line was forgotten.

