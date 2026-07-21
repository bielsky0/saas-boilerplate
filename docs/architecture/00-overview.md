## Stack

- **App:** Next.js (App Router) + React + TypeScript (`strict`, `output: "standalone"`)
- **Styling:** Tailwind CSS v4 + shadcn/ui-style primitives on Radix (`src/components/ui`),
  `@tailwindcss/typography` for long-form content
- **Content:** MDX (`@next/mdx`) in the repo, one registry per collection (`src/content/`)
- **Database:** PostgreSQL via Drizzle ORM, isolated behind `src/lib/db`
- **Env:** validated with `@t3-oss/env-nextjs` + Zod, fail-fast at startup
- **Package manager:** pnpm

## Directory layout

```
src/
  app/                     Next.js App Router routes (pages, layouts, route handlers)
    [locale]/              §16 EVERY page lives under a locale segment
      layout.tsx           the root layout (<html lang>, NextIntlClientProvider)
      (marketing)/         §8 public content chrome (blog, docs, changelog)
    api/                   NOT localized — an endpoint is not a page
    sitemap.ts robots.ts   §9 generated from src/lib/public-routes.ts
    opengraph-image.tsx    §9 default social card (root, NOT in a route group)
  content/                 §8 the content itself: <collection>/<slug>/{meta.ts,content.mdx}
  mdx-components.tsx       required by @next/mdx (no-arg useMDXComponents)
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
    site.ts                §9 site identity (name, description, canonical base URL)
    logger.ts              §15.3 structured logging + request-id correlation
    public-routes.ts       §2.5/§9.1 the public page surface (proxy + sitemap + robots)
    tenancy.ts             §1.4 MULTI_TENANCY_MODE — is the org layer offered at all?
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
   - `rate_limit` (§22.3) — a counter is keyed on a **client** identifier, which
     may map to no user and, behind a shared NAT, to several tenants at once.
     Per-tenant counters would hand an attacker a fresh allowance for every
     tenant they can name. Boundary: no feature code reads the table at all —
     the only readers are `src/proxy.ts` and the sign-in action.

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

