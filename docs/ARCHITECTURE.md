# Architecture & conventions

This document is the reference for how the codebase is organized so that both
humans and AI assistants can add modules predictably (spec §17). It describes
the directory layout, naming, and the reference patterns to copy when adding new
code. The full product spec lives in [specyfikacja.md](specyfikacja.md).

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

  `src/lib/adapters/rate-limit/` is a sixth, and shows what to do when an
  adapter's operation must be **atomic** rather than transactional. A counter is
  the mirror image of the jobs case: two requests racing toward the last slot of
  a window must serialise against **each other**, not join some caller's
  unrelated business write — so there is no `writer` parameter, and the postgres
  provider is one `INSERT … ON CONFLICT DO UPDATE`, never a read-modify-write.
  Two further things it demonstrates:
  - **Two decision helpers, not one.** `decide` judges a hit already counted
    (`count <= limit`); `decideNext` judges the hit about to happen
    (`count < limit`). Collapsing them makes every limit fire one attempt late.
  - **It fails OPEN.** A store that throws returns `allowed: true` and logs at
    warn — the same stance the proxy takes on the session guard, because failing
    closed turns a database blip into a total outage of every endpoint at once.

- **Translate a string (§16):** add the key to **`src/lib/i18n/messages/en.json` and
  `pl.json`**, then read it with `useTranslations("ns")` (client + sync server
  components) or `await getTranslations("ns")` (async server components).
  Namespaces mirror `src/features/*`, so "where does the string for X live?" has
  the same answer as "where does the code for X live?". Rules:
  1. **English is the shape.** `MESSAGES` is `Record<Locale, typeof en>`, so a key
     in `en.json` and missing from `pl.json` is a COMPILE error, and a new locale
     without a catalog is too. Verified, not assumed: delete a `pl.json` key and
     `pnpm typecheck` fails.
  2. **Outside a request, use `getTranslator(locale, ns)`** from `src/lib/i18n` —
     NOT `getTranslations()`. Emails render in a cron drain a week after any
     request (§10.3): there are no headers and no React cache there, so anything
     request-scoped throws. `getTranslator` is a pure function of
     (locale, messages).
  3. **Branch the SENTENCE, not the noun, when a value may be absent.** English's
     "Hi there" has no Polish equivalent (`Cześć {name},` with an empty name reads
     "Cześć ,"), and no choice of fallback WORD fixes that. Use an ICU `select` so
     each language writes its own variant — `greetingArgs()` in
     `src/lib/adapters/email/templates/layout.tsx` is the reference. Same for
     emphasis inside prose: `t.rich(...)` with a `<b>` tag in the message, never
     `<strong>` hard-coded around an interpolation, because word order moves.
  4. **Never hard-code a locale into a path.** Use `Link`/`redirect`/`usePathname`
     from `src/lib/i18n/navigation` — they add the active prefix. `pageMetadata`
     takes a BARE path and prefixes it itself.
  5. **Keys, not strings, in module-scope data.** A `const NAV = [{label: "Docs"}]`
     freezes one language at import time; `labelKey: "docs"` survives a switch.
     Reference: `src/app/[locale]/(marketing)/layout.tsx`.

  **Locale routing lives in `src/proxy.ts`, deliberately — next-intl's middleware
  is never imported.** Two systems cannot both own the response: the proxy must
  default-deny for auth (§2.5) and prefix for locale, and composing them by hand
  means ONE ordering, written down, that both concerns read. The ordering is
  load-bearing and its reasons are in that file — metadata images resolve before
  anything can prefix them, `/api/*` skips the prefix but NOT the guard, and the
  unprefixed→prefixed redirect must carry `search` or every `?token=` flow breaks.
  `localePrefix: "always"` (so `/` → `/en`) keeps the proxy REDIRECT-only, which is
  what guarantees the path the guard evaluated is the path the router serves; an
  `as-needed` scheme needs a rewrite, and then those two strings differ.
  Pure path helpers live in `src/lib/i18n/config.ts` — the proxy imports THAT, not
  the barrel, so React navigation never enters the proxy bundle.

- **Log something (§15.3):** `createLogger("<namespace>")` from `src/lib/logger.ts`,
  then `log.info("message", { key: value })`. Never `console.*` — `no-console` in
  `eslint.config.mjs` fails CI, with exactly two exemptions
  (`src/lib/adapters/email/log.ts`, the dev outbox, whose console output IS the
  feature; and `logger.ts` itself). Four rules:
  1. **Message is a constant; everything variable is a field.** `log.warn("no
recipients for payment-failed", { event: p.eventId })`, never a template
     literal — an interpolated message cannot be grouped or filtered by a
     collector, which is the whole point of §15.3.
  2. **`err` is reserved.** Put the caught value there (`{ err: error }`) and the
     renderer hands the Error to the console so its STACK survives. Stringifying
     an error into a field throws the stack away, and the stack is the reason you
     opened the log.
  3. **Pick the context by what the work IS, not by preference.** A request →
     `await requestLogger(ns)` (reads the proxy-minted `x-request-id` once). A job
     → plain `createLogger(ns)`; `job`/`name`/`attempt` arrive on their own via the
     ALS seeded in `src/lib/adapters/jobs/postgres.ts`'s claim loop. There is no
     per-request hook to seed an ALS from in App Router — the proxy and the render
     are separate invocations — which is why requests are explicit and jobs are not.
  4. **`requestId` ADDS a field, it never replaces one.** `event.id` (billing) and
     the job id are domain-scoped and stay authoritative; a line gains `requestId`
     on top, so the fields nest into a tree: request → (event | job).

  `LOG_FORMAT=pretty` (default) renders `[jobs] drain claimed=3 ok=3` for humans;
  `LOG_FORMAT=json` renders one object per line for a collector. **Set
  `LOG_FORMAT=json` in production** — same call sites, so a line cannot drift
  between the two. Reference: `src/lib/adapters/jobs/postgres.ts` (ALS seam +
  dead-letter/retry lines), `src/app/api/cron/jobs/route.ts` (`requestLogger`).
  Deliberately NOT an adapter: a logger has no vendor to swap — stdout is the
  interface — so a contract there would abstract over exactly one thing.

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
- **⚠️ The root layout reads the session, so every PAGE is dynamic — settled, not
  outstanding.** The impersonation banner (§6.2) lives in `src/app/layout.tsx`
  because it is a disclosure control: it must also cover `forbidden.tsx`,
  `/login` and the `(admin)` group, so there is nowhere to be in admin mode with
  no banner and no way out. `getServerSession()` calls `headers()`, which opts
  every page into dynamic rendering. For an anonymous visitor there is no cookie
  and therefore no query.

  This bullet used to say "revisit when §8/§9 land static blog/docs pages". §8/§9
  have landed, and the answer is that they are **server-rendered, not statically
  generated**, deliberately:
  - **Next 16 removed the per-route PPR opt-in.** `experimental_ppr` no longer
    exists (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`),
    so the escape hatch that bullet imagined is gone. The only remaining door is
    the app-wide `cacheComponents` flag, which changes caching semantics for the
    whole app and needs a `<Suspense>` boundary around every session read in
    `(app)` and `(admin)`. That is a phase of its own, not a §8 decision.
  - **Nothing in the spec requires SSG.** §9.1 asks for "server-side rendering
    **or** static generation", and the acceptance criterion is that content is
    visible with JavaScript disabled. It is: `e2e/content-no-js.spec.ts` asserts
    it with `javaScriptEnabled: false`.
  - **The cost, stated:** a content page costs a session lookup per render (no
    cookie ⇒ no DB query, so a crawler costs nothing) and is not CDN-cacheable.
    Bodies are compiled into the bundle, so a render reads no filesystem and no
    database.
  - **What is static anyway:** `sitemap.ts`, `robots.ts` and the `opengraph-image`
    routes are Route Handlers, which are **not** wrapped by the root layout — the
    build reports them as `○`. So the sitemap costs nothing per request even
    though the pages it lists are `ƒ`. If a build ever shows `ƒ /sitemap.xml`,
    something introduced a request-time API there; find it rather than accept it.

  `generateStaticParams` is still declared on `/blog/[slug]` and `/docs/[...slug]`.
  It does not prerender today; it is the line that starts working the day someone
  enables `cacheComponents`.

- **Publish content (§8):** create `src/content/<collection>/<slug>/meta.ts` (typed
  via `defineBlogMeta`/`defineDocMeta`/`defineChangelogMeta`) and `content.mdx`
  next to it, then add ONE line to that collection's `index.ts` registry.
  Reference: `src/content/blog/index.ts`. Rules:
  1. **The registry key IS the slug** — and the directory name, and the URL. There
     is deliberately no `slug` field on `meta`: a second source of truth can
     disagree with the other three, and the symptom is a post that renders at one
     URL and links to itself at another. A doc's key also carries its category
     (`guides/theming`), which is why a doc has no `category` field either.
  2. **Why a registry and not `fs.readdir`.** Pages are dynamic (see the bullet
     above), so an fs read would happen at REQUEST time, and `output: "standalone"`
     ships only what the bundler traced — `src/content/` would be missing from the
     container. `outputFileTracingIncludes` patches that, but its failure mode is a
     500 in production on a page that works in `pnpm dev` and in the E2E suite
     (which runs `pnpm start`, not the standalone server). Every specifier in a
     registry is a literal, so content is traced by construction and there is no
     config to forget. **Never "simplify" a registry into
     `await import(\`@/content/…/${slug}.mdx\`)`.**
  3. **The compiler cannot catch a forgotten registry line**, because nothing
     observes an unlisted file — so `e2e/seo-sitemap.spec.ts` does, by reading the
     content directory from disk and failing if a published post is missing from
     the sitemap. Verified to fail, not just written.
  4. **Drafts are filtered at the source.** `listBlogPosts()`/`listDocs()`/
     `listChangelog()` in `src/features/content/source.ts` drop `status: "draft"`
     unconditionally, so a draft cannot reach a listing, the sitemap or the search
     index by any caller; the page adds `notFound()`. `src/content/blog/scaling-
postgres-for-multi-tenancy` is the fixture that proves it — deleting it
     weakens the suite.
  5. **`source.ts` is the files-vs-database seam (§8.1).** It is the only module
     that imports `src/content/*`. Moving to a database is a rewrite of that one
     file; everything else already awaits.
- **Add a public route (§9.1):** add it to `src/lib/public-routes.ts` with its BARE
  path (`/pricing`, never `/en/pricing`) and answer `indexable`. `isPublicPage`
  strips the locale itself, so one entry covers every language — never multiply the
  table per locale. That one entry drives three consumers — `src/proxy.ts` (reachable
  without a session), `src/app/sitemap.ts` (listed) and `src/app/robots.ts`
  (disallowed) — so "reachable" and "indexed" cannot drift apart. `indexable` is
  mandatory, not optional: those are different questions that look like one, and
  /login is the first but not the second. **Never add a bare string to a public
  path list again.** `/` must keep `prefix: false`; a prefix rule on `/` matches
  every path and turns default-deny into open access.
- **Give a page metadata (§9.1):** always `pageMetadata()` from
  `src/features/content/seo.ts`. **Never hand-write `export const metadata = {
title, description }` on a page reachable without a session.** Metadata segments
  REPLACE `openGraph` rather than merging it, and Next only fills a page's title
  into openGraph when the page declares one (`inheritFromMetadata` is guarded by
  `if (target)`, see `next/dist/esm/lib/metadata/resolve-metadata.js`). A page
  setting only title/description therefore inherits the ROOT's og:title, so every
  share card reads "SaaS Boilerplate" while `<title>` looks perfect. That is why
  `e2e/seo-metadata.spec.ts` asserts og:title per page and not just `<title>`.
  Auth pages are public pages: they need `pageMetadata({ index: false })`, because
  a robots.txt `Disallow` stops crawling, not indexing.
- **OG image routes are public by construction (§9.1).** Next serves a generated
  image at a pathname with NO extension and puts the content hash in the QUERY
  (`/opengraph-image?a1b2c3`), so `proxy.ts`'s `.*\..*` skip — which tests the
  pathname — does not apply, and default-deny would 307 every share card to
  `/login`. A route group additionally appends a hash to the segment
  (`/blog/x/opengraph-image-yqks0s`), which is why `isMetadataImageRoute` matches a
  suffix and why the root card lives at `src/app/opengraph-image.tsx`, outside
  `(marketing)`. Reference: `isMetadataImageRoute` in `src/lib/public-routes.ts`.
- **Add structured data (§9.1):** build the node in
  `src/features/content/jsonld.ts` and render `<JsonLd data={…} />`. The `<`
  escape in that component is load-bearing: `JSON.stringify` will happily emit
  `</script>` from a post title, which ends the script element and drops the rest
  of the JSON into the page as markup — stored XSS via a blog title.
- **Style long-form content (§7.1/§8):** wrap it in `<Prose>`. The typography
  plugin's palette is mapped to our tokens once, in `globals.css`. **Never add
  `dark:prose-invert`** — the tokens already flip under `.dark`, so the single
  mapping is correct in both themes; invert would layer the plugin's own dark
  palette on top and break it. Tokens are HSL triplets, so the mapping must use
  `hsl(var(--x))`; a bare `var(--x)` silently yields no colour. The plugin also
  decorates inline `<code>` with literal backticks (`content: "`"`), which
globals.css clears. Both of those are **silent** failures — the page renders,
nothing errors, it just looks wrong — so `e2e/content-prose.spec.ts` asserts
  the computed colour in each theme and that the backtick pseudo-elements are
  gone. Styling assertions in an E2E suite are unusual; these earn their place
  because no other check in the suite looks at colour.
- **Adding a remark/rehype plugin (§8):** it must be a **string name with
  serializable options** — Turbopack passes plugins to a Rust loader and a
  JavaScript function cannot cross that boundary. A local plugin path does not
  resolve (`@next/mdx` resolves against a project root that is not the repo root).
  This is why there is no syntax highlighter: `rehype-pretty-code`/`@shikijs/rehype`
  earn their keep through function options (`transformers`, `getHighlighter`).
  Code blocks are styled with tokens in `mdx-elements.tsx` instead. Highlighting
  is not a §8/§9 requirement; revisit only with a serializable-options plugin.
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
- **Add a third-party origin (script, API, image) — spec 22.1:** the CSP is
  default-deny, so a new integration is invisible until you allow it. Do it with
  env, not code: `CSP_EXTRA_SCRIPT_SRC` / `_STYLE_SRC` / `_CONNECT_SRC` /
  `_IMG_SRC` (space-separated) append to the matching directive. Set
  `CSP_MODE=report-only` while wiring it up to see violations without breakage,
  then back to `enforce`. Policy lives in `src/lib/security/csp.ts`; the four
  constant headers in `src/lib/security/headers.ts`. Things worth knowing before
  you debug the wrong layer:
  - **The bucket origin is derived, not configured.** `csp.ts` computes it from
    the `S3_*` block with the same precedence as the storage adapter, because the
    browser uploads DIRECTLY to the bucket. Do not add it to `CSP_EXTRA_*`.
  - **`script-src` uses `'strict-dynamic'`**, so supporting browsers IGNORE host
    allowlists there. Load third-party scripts from an already-nonced script;
    `CSP_EXTRA_SCRIPT_SRC` only helps browsers without `'strict-dynamic'`.
  - **Rendering your own inline `<script>`/`<style>`?** It needs the nonce:
    `await getNonce()` from `src/lib/security/nonce.ts`. Reference:
    `src/features/content/components/json-ld.tsx`. Next nonces its own framework
    and bundle scripts automatically by parsing the CSP header. Note browsers
    hide the value — `getAttribute("nonce")` reads `""` while `el.nonce` has it,
    which matters when writing tests.
  - **`style-src` carries `'unsafe-inline'` deliberately** (sonner injects a
    stylesheet with no nonce hook). `script-src` is the strict one and must stay
    that way — `e2e/security-headers.spec.ts` asserts exactly that, scoped to
    `script-src`, and the assertion is worthless if widened to the whole header.
  - **The four constant headers are set in `next.config.ts`, not the proxy**,
    because the proxy matcher skips every path containing a dot (`robots.txt`,
    `sitemap.xml`, `.well-known/`, `public/`). The CSP is the opposite — proxy
    only, since it carries a per-request nonce. Never set the CSP in both: repeat
    CSP headers are INTERSECTED, so a nonce-less copy would veto the real one and
    stop every script on the site.
  - **`upgrade-insecure-requests` is emitted only when `BETTER_AUTH_URL` is
    https.** On an http origin it rewrites Better Auth's absolute redirects to a
    port nothing serves, and sign-in dies on a blank "This page couldn't load"
    with no violation logged anywhere.
- **Add or tune a rate limit — spec 22.3:** the policy lives in ONE place,
  `src/lib/security/rate-limit.ts`: `tierFor()` maps a request to a tier and
  `TIERS` gives each tier its rule. `src/proxy.ts` only counts and attaches; the
  adapter (`src/lib/adapters/rate-limit/`) only stores. Things worth knowing
  before you change any of it:
  - **`tierFor` is first-match-wins, and the order is the design.** Exemptions
    are enumerated at the top; everything else under `/api/` falls through to
    `read`/`write` by method. So a route added next month is limited **by
    default**, and exempting one is a deliberate edit — not something you can
    forget into existence.
  - **Tune with `RATE_LIMIT_MODE=report-only` first.** It counts, emits the
    `RateLimit-*` headers and logs every would-be block without answering 429.
    This is the same move the CSP entry above recommends, for the mirror-image
    reason: a CSP that ships disabled goes unnoticed, whereas a rate limit that
    ships too tight is an outage.
  - **The tiers are code, the login numbers are env.** `RATE_LIMIT_LOGIN_ATTEMPTS`
    / `_WINDOW_S` are §2.1 policy an operator tunes; the other four tiers are a
    _shape_ (read looser than write, write looser than expensive) and five
    independent env vars would just be five ways to make it incoherent.
  - **Two endpoints are exempt on purpose, and both would be actively harmful to
    limit.** `/api/billing/webhook`: Stripe retries every non-2xx, so a 429 there
    produces _more_ traffic and walks toward Stripe disabling the endpoint — the
    limiter would cause the outage it exists to prevent, and the HMAC already
    gates it before any DB work. `/api/cron/*`: a throttled drain does not fail
    loudly, it silently stops every retry and all scheduled work.
    `/api/unsubscribe` is limited but at the loosest tier, because a blocked
    RFC 8058 unsubscribe is a compliance failure.
  - **⚠️ `RATE_LIMIT_FORWARDED_DEPTH` is the security-critical variable.** The
    client IP is taken that many entries from the RIGHT of `X-Forwarded-For`,
    because the left end is whatever the client typed. Set it wrong and the
    limiter is bypassable by rotating one header — i.e. decorative. 1 is correct
    on Vercel and behind a single nginx. (Note `src/features/admin/audit.ts`
    takes the LEFTMOST value; that is correct there because it is _evidence_, and
    would be a vulnerability here because this is a _control_. Do not unify them.)
  - **`RATE_LIMIT_PROVIDER=memory` counts per PROCESS.** Behind N instances the
    effective limit is N × the limit. Switch to `postgres` on Vercel or any
    horizontally scaled deploy, and run `pnpm db:migrate`.
  - **The login limit is deliberately NOT enforced by the proxy.** Sign-in is a
    server action, which POSTs to a page URL and never matches an `/api` rule, so
    `signInAction` calls the adapter itself. That duplication is the point:
    "the general limit must not override the login limit" cannot be guaranteed by
    the same table it is a claim about. Limits compose by intersection — nothing
    anywhere removes a bucket.
  - **⚠️ E2E: a spec that drives a login must `import { expect, test } from
"./rate-limit-fixtures"`**, not from `@playwright/test`. The suite runs
    `fullyParallel` against one origin with no `X-Forwarded-For`, so without the
    fixture's per-test bucket header every worker shares the `"unknown"` bucket
    and specs fail each other with a "too many sign-in attempts" message that
    looks nothing like the cause. `/api/dev/*` is exempt from the limiter, so
    plain seeding needs no fixture. The suite runs at PRODUCTION limits on
    purpose — see `e2e/rate-limit-fixtures.ts`.

## Rate limiting in production

`RATE_LIMIT_PROVIDER=memory` is the default because the adapter factory runs at
module load and a default that can throw breaks `next build` for everyone. It is
correct for a single container and for CI. **It is not correct for a multi-
instance deploy**, where each instance keeps its own Map and the effective limit
becomes N × the configured one. Set `RATE_LIMIT_PROVIDER=postgres` there: one
shared counter, one atomic upsert, and the database's clock as the single source
of truth (which is why every timestamp in that adapter is computed with `now()`
rather than passed in from Node).

Expired counters are reclaimed by the `ratelimit.prune` job, enqueued from
`/api/cron/jobs` with an **hourly** dedupe key rather than the daily one
`job.prune` and `storage.purge` use — rate-limit rows are one per client per
bucket and expire in minutes, so a daily sweep would carry a full day of dead
rows in a table the request path writes to constantly. On Vercel Hobby (daily
cron only) it degrades to one prune per run. Skipping it entirely costs disk, not
correctness: an expired row is reset by the next `consume` rather than read.

**A deployment with no reverse proxy in front of it gets ONE bucket for the
entire internet.** `clientIp()` has no socket address to fall back on (`NextRequest.ip`
was removed in Next 15), so with no `X-Forwarded-For` every anonymous request
keys to `"unknown"`. That only ever over-restricts, never under-restricts, but it
means one abusive client can exhaust the anonymous allowance for everyone.
Authenticated traffic is unaffected — it keys on the session.

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
>
> **The content specs (§8/§9) are the exception, and say so in their own JSDoc.**
> `seo-sitemap`, `seo-metadata` and `content-no-js` touch no database and hold no
> session: their fixtures are the boilerplate's own example posts, which are
> stable by design. Do not add `uniqueEmail()` there out of habit. Two of them
> read `src/content/` from disk on purpose — fs is free in a test runner, and it
> is what catches a post whose registry line was forgotten.

### Canonical URLs are baked at BUILD time (spec 9.1, 19.1)

`NEXT_PUBLIC_APP_URL` feeds `src/lib/site.ts`, which feeds `metadataBase`, every
canonical URL, every OG tag and `sitemap.xml`. Two properties combine into one
sharp edge:

- `NEXT_PUBLIC_*` is **inlined at build time** (that is what "public" means — it
  reaches the browser bundle), and
- `sitemap.xml` / `robots.txt` are **statically generated**.

So the host in your canonical tags is frozen when the image is built. One Docker
image cannot serve two domains: it will advertise whichever URL was set at build,
and a wrong canonical actively de-indexes the site it points away from. Pass it as
a **build arg**, not a runtime env var:

```dockerfile
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm build
```

Build one image per domain. On Vercel this is automatic — the value is set per
project/environment before the build.

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
