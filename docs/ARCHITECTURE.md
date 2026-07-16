# Architecture & conventions

This document is the reference for how the codebase is organized so that both
humans and AI assistants can add modules predictably (spec §17). It describes
the directory layout, naming, and the reference patterns to copy when adding new
code. The full product spec lives in [specyfikacja.md](specyfikacja.md).

## Stack

- **App:** Next.js (App Router) + React + TypeScript (`strict`, `output: "standalone"`)
- **Styling:** Tailwind CSS v4 + shadcn/ui-style primitives on Radix (`src/components/ui`)
- **Database:** PostgreSQL via Drizzle ORM, isolated behind `src/lib/db`
- **Env:** validated with `@t3-oss/env-nextjs` + Zod, fail-fast at startup
- **Package manager:** pnpm

## Directory layout

```
src/
  app/                     Next.js App Router routes (pages, layouts, route handlers)
  components/              Shared presentational components
    ui/                    Design-system primitives (token-driven)
  features/                Domain modules = vertical slices (UI + app logic per domain)
    auth/                  §2  authentication
    organizations/         §3  multi-tenancy / orgs
    rbac/                  §4  roles & permissions
    billing/               §5  plans, checkout, quota
    admin/                 §6  super-admin
    emails/                §10 categories, suppression, the one send path
    onboarding/            §10.3 the day 0/3/7 sequence
    jobs/                  §12 handler registry, enqueue, drain triggers
    content/               §8/§9 blog, docs, changelog, SEO
    plugins/               §18 optional add-ons
  lib/                     Cross-cutting, non-feature code
    env/                   validated environment (server.ts / client.ts)
    db/                    Drizzle client + schema/ + migrations/
    adapters/              provider adapters behind internal contracts (§1.2)
      auth/ billing/ email/ jobs/ storage/
    auth/                  server-side session + authorization helpers (§4.2)
    i18n/                  §16 translations & locale formatting
```

Each leaf currently holds an `index.ts` with a header comment stating its
responsibility and the spec section it implements. Replace `export {}` with real
exports as modules are built.

## Core principles

1. **No vendor lock-in (§1.2).** Feature/UI code never imports a provider SDK
   directly. It depends on the contract in `src/lib/adapters/<provider>`; only
   the adapter implementation imports the SDK. Swapping a provider = one adapter.

2. **Tenant isolation (§1.3, §11.2).** Every **business** record belongs to
   exactly one owner (`organization_id` **or** `account_id`). All queries are
   scoped by that key in the data-access layer — the UI is never a security
   boundary.

   **System/infrastructure** tables are exempt, and the exemption is a rule, not a
   list: a table qualifies when its subject is not a tenant record **and** its
   access boundary is a system credential rather than an owner filter. Both halves
   must hold, and each such table justifies itself in its own header:
   - the Better Auth identity tables (`user`, `session`, `account`,
     `verification` in `src/lib/db/schema/auth.ts`) — the identity substrate
     multi-tenancy is built on top of; a user exists before any tenant does;
   - `audit_log` (§6.3) — a super-admin action log is cross-tenant by definition
     and may concern no tenant at all. Boundary: `requireSuperAdmin()`;
   - `job` (§12) — a cron job (retention purge, weekly reports) belongs to no
     tenant, so an XOR CHECK cannot hold. Boundary: `CRON_SECRET` /
     `requireSuperAdmin()`. Tenant ids live in `payload`, as data;
   - `email_suppression` (§10.3) — an address is not a tenant record: it may map
     to no user, and to several tenants at once. Boundary: an HMAC-signed link.

   `src/features/admin/data.ts` likewise queries **across** tenants by design,
   because §6.2 requires a global view; `requireSuperAdmin()` is what replaces the
   owner filter, and `no-restricted-imports` in `eslint.config.mjs` fences it so an
   unguarded caller fails CI rather than silently breaching isolation.

   The instructive near-miss is `webhook_event`: it looks like infrastructure, but
   it is only ever written **after** its owner is resolved, so it carries the owner
   like any business table. "The query is awkward to scope" is not the same as "the
   subject is not a tenant record".

3. **Authorization on the backend (§4.2).** Every data-changing server action
   checks the required permission in the active-organization context and returns
   403 otherwise. UI hiding/disabling is cosmetic only.

4. **Env is validated, not read raw (§19.1).** Never touch `process.env`
   directly. Add variables to `src/lib/env/server.ts` (server) or
   `src/lib/env/client.ts` (`NEXT_PUBLIC_*`). The schema is imported from
   `next.config.ts`, so a missing var fails `pnpm dev`/`pnpm build` immediately.

5. **The fast path is an optimization; the durable check is the guarantee
   (§10, §12).** Async work resolves the same way everywhere in this codebase, and
   it is worth naming because each instance looks like a local trick until you see
   the pattern:
   - `after()` drains the queue post-response; **cron is what actually delivers.**
     Losing the kick delays work, it never drops it.
   - `enqueueEmail` checks suppression to avoid junk rows; **the handler's
     send-time check is what honors an unsubscribe.** A day-7 job enqueued on day 0
     cannot know about a day-2 opt-out.
   - The onboarding sequence is never cancelled by deleting rows; **the handler's
     run-time guard is the interrupt.** A delete would race the claim and lose.
   - The webhook's watermark protects the upsert; **`billing.notify` re-reading the
     current row is what stops a stale event mailing a false confirmation.**

   When adding async work, ask which of your two checks survives a crash, a
   redelivery, and a week of elapsed time. That one is load-bearing; the other is
   just latency.

## Reference patterns (fill in as modules land)

These are the canonical examples to copy. Each should have a real reference
implementation in code once the corresponding module is built (spec §17.2):

- **Add a provider adapter:** create `src/lib/adapters/<name>/` with a
  `contract.ts` (interface) + a concrete implementation; expose it via `index.ts`.
  Reference: `src/lib/adapters/auth/` (`contract.ts` → `AuthAdapter`,
  `better-auth.ts` = the only file importing the SDK, `index.ts` = the barrel
  exporting `authAdapter`). `src/lib/adapters/email/` is a second example, whose
  `index.ts` picks the concrete provider from an env var.
  `src/lib/adapters/billing/` is a third (`stripe.ts` = the only file importing
  the Stripe SDK; `none.ts` is the do-nothing default). Note the shape both
  `email` and `billing` share: the default provider must NEVER throw at
  construction, because the factory runs at module load and would break
  `next build` for anyone without that vendor configured — hence
  `EMAIL_PROVIDER=log` and `BILLING_PROVIDER=none`.
  `src/lib/adapters/jobs/` is a fourth, and shows what to do when an adapter's
  operation must participate in the CALLER's transaction. `enqueue(writer, …)`
  always writes a row; the adapter is the thing that **drains** (the postgres one
  executes the handler; a hosted scheduler would forward the row instead). That
  transactional-outbox shape is what lets the contract demand a `writer` without
  lying — the tempting "simplification" of having a hosted adapter's `enqueue` call
  its own SDK silently destroys atomicity, because an HTTP call cannot roll back.
  `AdminAuthAdapter` (same `contract.ts` as auth) is a fifth, and shows what to do
  when a vendor's shape does NOT match the spec's vocabulary. Three rules there:
  1. **One source of truth, translated at the boundary.** Better Auth's `admin`
     plugin stores the super-admin flag as a role string in `user.role`. The
     contract exposes a plain `isSuperAdmin: boolean`, derived in the adapter.
     A second `isSuperAdmin` column kept "in sync" would be a security defect,
     not just duplication: the plugin's own gate reads `role`, so drift means the
     UI and the engine disagree about who is an admin. The role vocabulary is
     `superadmin`/`user` (never `admin`) so it cannot be confused with
     `membership.role` — a system role is not an org role.
  2. **`adminUserIds` must NEVER be set.** `has-permission.mjs` short-circuits
     `if (adminUserIds.includes(userId)) return true` _before_ any permission
     check, which silently grants `user:impersonate-admins`. One super admin
     could then impersonate another, and that session would pass
     `requireSuperAdmin`. Bootstrap with SQL instead (see below).
  3. **Reads do not belong in the adapter.** The engine's own user list cannot
     join our memberships/subscriptions or see our `deletedAt`. Only operations
     that need the identity ENGINE (minting/revoking sessions) are in the
     contract; everything else is a Drizzle query in `features/admin/data.ts`.
- **Add a background job (§12):** add the name to `JobName` and its payload to
  `JobPayloads` in `src/lib/adapters/jobs/contract.ts`, write the handler in the
  owning feature, and register it in `src/features/jobs/registry.ts` (`JobRegistry`
  is `Record<JobName, _>`, so a name with no handler is a compile error). Enqueue
  with `enqueueJob(writer, …)` from `src/features/jobs/enqueue.ts`. Four rules:
  1. **Pass a `tx` as `writer` whenever the job accompanies a business write.**
     Enqueue is a plain INSERT, so it commits — or rolls back — atomically with
     your change. Reference: `src/features/billing/webhooks.ts` enqueues the
     notification inside the same transaction as the idempotency marker, and
     inherits its exactly-once guarantee for free. Sending mail there instead would
     double-send on the rollback path, hold a pooled connection across an HTTP call
     (deadlock — see `features/admin/audit.ts`), and make webhook latency depend on
     the email provider.
  2. **Handlers must be idempotent.** The queue is at-least-once, never
     exactly-once: `runAt` doubles as a visibility timeout, so a job still running
     at `CLAIM_TIMEOUT` is claimed again. Use a `dedupeKey` for anything whose
     trigger can fire twice.
  3. **Payloads are JSON primitives, and untrusted on the way out.** `payload` is
     jsonb: a `Date` goes in and an ISO string comes back with the type still
     claiming `Date`. Every handler zod-parses its payload first — see
     `src/features/emails/handler.ts`.
  4. **A no-op is success, not failure.** A suppressed email or an interrupted
     sequence step returns cleanly; retrying would never change the answer, and
     dead-lettering fills the queue with red rows recording correct behaviour.

  Worked examples, in increasing order of subtlety: `src/features/jobs/handler.ts`
  (`job.prune` — a cron-shaped task), `src/features/emails/handler.ts` (validation
  - send-time policy), `src/features/onboarding/handler.ts` (a scheduled step with
    a run-time guard), `src/features/billing/notify.ts` (fan-out into per-recipient
    children, so a partial failure cannot re-mail anyone).

- **Add an email template (§10.2):** add it to `TemplateName` and `TemplateProps`
  in `src/lib/adapters/email/contract.ts`, write the component in
  `src/lib/adapters/email/templates/`, register it in that folder's `index.ts`, and
  classify it in `src/features/emails/categories.ts` (`Record<TemplateName, _>` —
  forgetting is a compile error). Send with `enqueueEmail(writer, …)`; **never call
  `email.send` directly** — the `email.send` handler is the one delivery path, which
  is what keeps retry, suppression and List-Unsubscribe in one place each.
  Templates are plain JSX rendered by `@react-email/render`, which produces the HTML
  and the plain-text fallback from one component. Mail clients are not browsers:
  inline styles only, no flex/grid, no external assets.
- **Add a tenant-isolated entity:** add a table in `src/lib/db/schema/<entity>.ts`
  with an indexed owner column, re-export from `schema/index.ts`, run
  `pnpm db:generate` then `pnpm db:migrate`. The auth tables in
  `src/lib/db/schema/auth.ts` show the schema/migration mechanics (they are the
  tenant-owner exception noted above). **Owner-scoped reference:** the two tenant
  owners are `personal_account` and `organization`; `membership`/`invitation`
  carry an indexed `organizationId` and every read/write is scoped by it in the
  feature's data layer `src/features/organizations/data.ts` — copy that layer's
  shape (never query a tenant table without its owner filter).
- **Add a UI primitive (design system, §7.1):** put it in `src/components/ui/<name>.tsx`
  and export it from `src/components/ui/index.ts`. Rules: style only with the
  semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`…) — never
  raw colors like `black/10` or `red-600`; compose classes with `cn()` from
  `src/lib/utils.ts` so a caller's `className` can override defaults; express
  variants with `cva`. Reference: `button.tsx` (`cva` + `asChild` via Radix `Slot`,
  which is how a `<Link>` is rendered as a button — see the dashboard's "New
  organization"). Interactive/overlay primitives wrap Radix so focus management
  and ARIA come for free: `dialog.tsx`, `select.tsx`, `dropdown-menu.tsx`.
- **Add/derive a design token (§7.1):** edit `src/app/globals.css` only. Tokens are
  HSL triplets under `:root` with a `.dark` override, mapped to Tailwind utilities
  in `@theme inline`. Dark mode is **class-based** (`@custom-variant dark`), driven
  by next-themes via `ThemeProvider` in the root layout — never reintroduce
  `prefers-color-scheme` in components, and never hard-code a color in a component.
- **⚠️ The root layout reads the session, so every route is dynamic.** The
  impersonation banner (§6.2) lives in `src/app/layout.tsx` because it is a
  disclosure control: it must also cover `forbidden.tsx`, `/login` and the
  `(admin)` group, so there is nowhere to be in admin mode with no banner and no
  way out. The cost was accepted knowingly — `getServerSession()` calls
  `headers()`, which opted the landing page (the only static route) into dynamic
  rendering. For an anonymous visitor there is no cookie and therefore no query.
  **Revisit when §8/§9 land static blog/docs/SEO pages:** either move the banner
  into a shared authenticated layout, or adopt PPR + `<Suspense>`. Do not
  discover this while debugging blog cache misses.
- **Confirm a destructive action (§7.1):** use `ConfirmDialog`. Because the dialog
  is portaled outside the `<form>`, give the form an `id` (`useId()`) and pass it as
  `confirmForm` — the HTML `form` attribute lets the portaled confirm button submit
  it. Reference: `DeleteOrgButton`/`LeaveOrgButton` in
  `src/features/organizations/components/org-settings.tsx`.
- **Give feedback from a server action:** validation/permission **errors** render
  inline via `FormMessage` (they must persist and be assertable); transient
  **successes** fire a `toast(...)` from a `useEffect` keyed on the `useActionState`
  state. Reference: `invite-member-form.tsx` and `org-settings.tsx`.
- **Add a protected endpoint / server action:** resolve the session via
  `requireSession()` in `src/lib/auth/index.ts` before doing anything. Reference:
  the `src/app/(app)/dashboard/page.tsx` server component and the sign-out server
  action in `src/features/auth/actions.ts`.
- **Soft delete + retention (§11.3):** set `deletedAt`; never hard-delete from
  feature code. `organization`, `personal_account` and `user` carry the flag.
  Policy and the retention window live in `src/features/admin/retention.ts`.
  Access revocation is already structural and does not wait for a purge: a
  soft-deleted user cannot sign in (a `session.create.before` hook in the auth
  adapter) and their live sessions die on the next request (`getSession` returns
  null on `deletedAt`). **The purge job itself is deferred to §12**, and
  `retention.ts` records the hard blocker whoever builds it will hit —
  `organization.createdByUserId` is `onDelete: "restrict"`, so hard-deleting any
  user who ever created an org fails at the FK and needs its own migration.
- **Receive a provider webhook (§5.4):** reference:
  `src/app/api/billing/webhook/route.ts` + `src/features/billing/webhooks.ts`.
  Four rules, in order of how badly they bite:
  1. **The signature is the authentication.** A webhook has no session, so the
     route must be exempted in `src/proxy.ts` (`isPublicPath`) — otherwise the
     guard answers 307 to `/login` and providers, which do not follow redirects,
     retry forever. Verification lives in the ADAPTER, so the route never
     imports a vendor SDK.
  2. **Read the raw body with `request.text()`**, never `request.json()`: the
     signature covers the exact bytes sent, so re-serializing invalidates it.
     (Equally: any proxy that buffers or rewrites the body breaks it.)
  3. **Idempotency = marker + effect in ONE transaction.** Insert into
     `webhook_event` with `onConflictDoNothing().returning()`; an empty result
     means "already processed", so return early. Keeping the effect in the same
     transaction is what makes a failure retryable: the marker rolls back with
     it, instead of permanently recording work that never happened. Write a
     marker only on the processed path — never for an event you ignore, or a
     later provider-side resend will hit the marker and skip.
  4. **Order is not guaranteed**, and a retry landing late IS a stale event.
     Carry the provider's event timestamp as a watermark and guard the upsert
     with `setWhere` (`lastEventAt <= occurredAt`), so an old event cannot
     overwrite newer state.
- **Add a super-admin action or page (§6):** call `requireSuperAdmin()` from
  `src/features/admin/context.ts` as the FIRST line — of the page **and** of the
  action. The `(admin)` layout calls it too, but a layout guards neither server
  actions nor a direct fetch, so it is shell decoration, not the boundary.
  Reference: `src/features/admin/actions.ts` + `src/app/(admin)/admin/users/page.tsx`.
  - **Why there is no super-admin middleware, despite §6.1's wording:** `proxy.ts`
    is edge-safe with no DB and Next's own docs say proxy "should not be used as
    a full session management or authorization solution". The only edge-available
    alternative is a cookie claim, which impersonation actively invalidates — it
    swaps the session cookie, so a cached flag is stale exactly when it matters.
    §4.2 already settled the pattern (`requireOrgPermission` + `forbidden()`, with
    `e2e/rbac-enforcement.spec.ts` asserting a real 403); §6 follows it. The proxy
    still does its job: default-deny already redirects anonymous `/admin` to
    `/login`, so no proxy change was needed.
  - **Audit every privileged action (§6.3)**, following the two rules in
    `src/features/admin/audit.ts`. Pick by asking who owns the DB connection:
    **Rule A** (the effect is ours, e.g. a soft delete) — write the audit row in
    the SAME transaction as the effect. **Rule B** (the effect is the auth
    engine's, e.g. impersonate/suspend) — a shared transaction is impossible, so
    audit FIRST in its own transaction, then call the engine, and fail closed. The
    log records authorized intent: it over-logs rather than under-logs.
  - **Never read the session after a cookie swap.** `headers()` returns the
    REQUEST headers for the whole request; a `Set-Cookie` only lands on the
    response. Calling `getSession()` after `impersonate`/`stopImpersonating`
    re-reads a session the engine just deleted, and the engine answers by clearing
    the cookie — silently logging the admin out. Resolve everything you need
    (including audit attribution) BEFORE the swap.
  - **Bootstrap the first super admin with SQL** — there is deliberately no
    in-app path, because granting the flag requires an existing super admin:
    ```sql
    UPDATE "user" SET role = 'superadmin' WHERE email = 'you@example.com';
    ```
    (E2E uses `POST /api/dev/seed-super-admin`, which is 404 in production.)
- **Add an org-scoped (RBAC) action or page:** call `requireOrgPermission(slug,
permission)` from `src/features/organizations/context.ts` as the FIRST line —
  it resolves the active org from the URL slug, checks the centralized role→
  permission map in `src/features/rbac/index.ts`, and calls Next's `forbidden()`
  (a real 403) when the permission is missing (spec 4.2). Reference: every action
  in `src/features/organizations/actions.ts` and the guarded
  `src/app/(app)/orgs/[slug]/settings/page.tsx`. UI gating via `hasPermission` is
  cosmetic only. The active tenant is always derived from the `/orgs/[slug]` URL
  (stateless, refresh-safe — spec 3.5), never from hidden session state.

## Common commands

| Command                        | Purpose                                  |
| ------------------------------ | ---------------------------------------- |
| `pnpm dev`                     | Run the app locally                      |
| `pnpm build` / `pnpm start`    | Production build / serve                 |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit`                  |
| `pnpm test:e2e`                | Playwright E2E (auth flows)              |
| `pnpm format`                  | Prettier write                           |
| `pnpm db:up` / `pnpm db:down`  | Start / stop local Postgres (Docker)     |
| `pnpm db:generate`             | Generate a migration from schema changes |
| `pnpm db:migrate`              | Apply pending migrations                 |
| `pnpm db:studio`               | Open Drizzle Studio                      |

## Local setup

1. `cp .env.example .env` and adjust if needed (set a real `BETTER_AUTH_SECRET`).
2. `pnpm install`
3. `pnpm db:up` then `pnpm db:migrate`
4. `pnpm dev` → http://localhost:3000

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

### Background jobs in production (spec 12, 19.1)

Two things drain the queue, and **only one of them is a guarantee**:

- `after()` fires a drain once the response is sent. It covers the happy path, and
  needs no configuration.
- `GET /api/cron/jobs` is what actually delivers. Retries, the day-3/day-7
  onboarding steps and the daily prune exist **solely** because something calls it.

**Set `CRON_SECRET` in production.** Without it the route answers 404 and nothing
drains — but mail still appears to work, right up until the first provider blip,
which then never recovers. That asymmetry is the whole hazard: the symptom of a
missing `CRON_SECRET` is silence, not an error.

Authentication is a bearer token rather than a Vercel signature, so **one mechanism
serves both deploy targets** (§19.1):

```bash
# Vercel: `vercel.json` already declares the schedule, and Vercel Cron attaches
# `Authorization: Bearer $CRON_SECRET` automatically. Just set CRON_SECRET.
#
# Docker / standalone Node: point any scheduler at the same URL.
curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/jobs
```

> **Vercel Hobby is daily-only.** It rejects sub-daily cron expressions, so
> `vercel.json` ships `0 3 * * *`. Consequence: `after()` still covers the happy
> path, but a _retry_ could wait up to 24h. Because auth is a bearer secret, any
> external pinger (cron-job.org, a GitHub Actions `schedule:`, UptimeRobot) hitting
> the same URL every few minutes fixes that with zero code change. Pro allows
> `*/1 * * * *`.

Do **not** replace this with an in-process `setInterval`: it does not exist on
Vercel, so the primary deploy target would silently have a different execution
model from the secondary one — and it would make the E2E suite nondeterministic,
since a background drain racing `expect()` is a flake generator.

Locally, drain by hand with `POST /api/dev/jobs/run` (404 in production); inspect
the queue with `GET /api/dev/jobs`, or `pnpm db:studio` → `job`.

### Billing webhooks locally (spec 5.4)

The webhook test suite is fully offline — signature verification is a local
HMAC, so no Stripe account, API key or CLI is involved. To exercise the endpoint
against real Stripe events instead:

```bash
brew install stripe/stripe-cli/stripe   # not bundled; needs your Stripe login
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
# `stripe listen` prints a whsec_… — put it in .env as STRIPE_WEBHOOK_SECRET
# and set BILLING_PROVIDER=stripe, then in another shell:
stripe trigger customer.subscription.created
```

Events for customers with no `billing_customer` mapping are acknowledged and
ignored (a warning is logged), so a shared test-mode account does not pollute
your database. Nothing in CI depends on the CLI.
