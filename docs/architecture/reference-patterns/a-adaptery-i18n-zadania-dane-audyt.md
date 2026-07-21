## Reference patterns (fill in as modules land) — część 1: adaptery, i18n, logowanie, zadania w tle, e-mail, encje domenowe, audyt

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
- **Audit a state change (§6.4):** add the action name to `AUDIT_ACTIONS` in
  `src/features/admin/audit.ts`, then call `recordAudit(tx, …)` **inside the same
  transaction as the write** (Rule A — the module header explains when the other
  ordering, Rule B, applies instead). Three things that are not optional:
  `organizationId` is a **required** field, so a call site must state its tenant or
  explicitly write `null`; the actor comes from `resolveActor(session)` — never
  build one by hand, because it is what attributes an impersonated action to the
  ADMIN rather than the account they are wearing; and a `targetLabel` lookup that
  needs a second query must use `tx`, not `db`, or it deadlocks against the
  transaction holding the connection. Field-level before/after goes in
  `metadata.changes` via `changed(before, after, fields)`, which returns
  `undefined` when nothing differs — check it, so a no-op write logs nothing.
  **Reference:** `updateMemberRoleAction` in
  `src/features/organizations/actions.ts` (user actor, `FOR UPDATE` pre-image,
  `tx` label lookup); `applySubscriptionEvent` in `src/features/billing/webhooks.ts`
  (`SYSTEM_ACTOR`, and `.returning()` as the "this event changed nothing" signal);
  `src/features/storage/purge.ts` (system actor from a background job, one row per
  tenant rather than per record). Reading it back is tenant-scoped in
  `src/features/organizations/audit-data.ts` and cross-tenant in
  `src/features/admin/data.ts` — the two have deliberately opposite boundaries, so
  do not merge them into one function with a nullable owner argument.
- **Add a UI primitive (design system, §7.1):** put it in `src/components/ui/<name>.tsx`
  and export it from `src/components/ui/index.ts`. Rules: style only with the
  semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`…) — never
  raw colors like `black/10` or `red-600`; compose classes with `cn()` from
  `src/lib/utils.ts` so a caller's `className` can override defaults; express
  variants with `cva`. Reference: `button.tsx` (`cva` + `asChild` via Radix `Slot`,
  which is how a `<Link>` is rendered as a button — see the dashboard's "New
  organization"). Interactive/overlay primitives wrap Radix so focus management
  and ARIA come for free: `dialog.tsx`, `select.tsx`, `dropdown-menu.tsx`.
