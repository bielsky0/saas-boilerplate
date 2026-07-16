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

2. **Tenant isolation (§1.3, §11.2).** Every business record belongs to exactly
   one owner (`organization_id` **or** `account_id`). All queries are scoped by
   that key in the data-access layer — the UI is never a security boundary.
   _Exception:_ the Better Auth identity tables (`user`, `session`, `account`,
   `verification` in `src/lib/db/schema/auth.ts`) carry no owner column — they
   are the identity substrate multi-tenancy is built on top of.

3. **Authorization on the backend (§4.2).** Every data-changing server action
   checks the required permission in the active-organization context and returns
   403 otherwise. UI hiding/disabling is cosmetic only.

4. **Env is validated, not read raw (§19.1).** Never touch `process.env`
   directly. Add variables to `src/lib/env/server.ts` (server) or
   `src/lib/env/client.ts` (`NEXT_PUBLIC_*`). The schema is imported from
   `next.config.ts`, so a missing var fails `pnpm dev`/`pnpm build` immediately.

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
> the same unique constraint.

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
