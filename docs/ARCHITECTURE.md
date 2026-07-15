# Architecture & conventions

This document is the reference for how the codebase is organized so that both
humans and AI assistants can add modules predictably (spec §17). It describes
the directory layout, naming, and the reference patterns to copy when adding new
code. The full product spec lives in [specyfikacja.md](specyfikacja.md).

## Stack

- **App:** Next.js (App Router) + React + TypeScript (`strict`, `output: "standalone"`)
- **Styling:** Tailwind CSS v4 (+ shadcn/ui-style primitives later)
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
- **Add a tenant-isolated entity:** add a table in `src/lib/db/schema/<entity>.ts`
  with an indexed owner column, re-export from `schema/index.ts`, run
  `pnpm db:generate` then `pnpm db:migrate`. The auth tables in
  `src/lib/db/schema/auth.ts` show the schema/migration mechanics (they are the
  tenant-owner exception noted above). Owner-scoped reference: _to be added with §3._
- **Add a protected endpoint / server action:** resolve the session via
  `requireSession()` in `src/lib/auth/index.ts` before doing anything. Reference:
  the `src/app/dashboard/page.tsx` server component and the sign-out server
  action in `src/features/auth/actions.ts`. RBAC/tenant checks layer on in §3/§4.

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
