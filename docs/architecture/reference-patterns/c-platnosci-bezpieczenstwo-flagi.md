## Reference patterns (fill in as modules land) — część 3: płatności, webhooki, RBAC/super-admin, CSP, rate limiting, feature flagi

- **Take money (§5.3, §5.5):** reference: `src/features/billing/checkout.ts` +
  `src/app/api/billing/{checkout,portal}/route.ts`. Four rules:
  1. **Persist the customer mapping BEFORE creating a checkout session.** The
     ordering is an invariant, documented on `schema/billing-customers.ts` and
     enforced in `ensureBillingCustomer`: it is what lets the webhook treat an
     unresolvable customer as "not ours" and ignore it, instead of retrying
     forever against a row that was never written. Reversing the two steps
     creates a race that only appears under real provider latency.
  2. **The redirect confirms; the webhook entitles.** Nothing on the success path
     grants access — the user can close the tab before being redirected, and the
     URL is guessable. `e2e/billing-checkout.spec.ts` asserts exactly this.
  3. **Routes answer with a URL, not a 3xx.** The caller is `fetch` from a client
     component; a redirect would be followed opaquely, leaving no way to tell a
     provider outage from a success. The client navigates via
     `window.location.assign`.
  4. **`NOT_CONFIGURED` → 404**, matching the webhook route under
     `BILLING_PROVIDER=none`: a deployment without a provider must not advertise
     a checkout it cannot complete. Adapter errors stay coarse
     (`PROVIDER_ERROR`) so no caller branches on a vendor's error taxonomy.

  Plans live in `src/features/billing/plans.ts` and are the SINGLE source for the
  public pricing table, the checkout route and (from §5.6/5.7) quota and
  entitlements. The landing page must never keep its own plan list — it used to,
  and the two had already drifted to an `ent` plan the billing config never had.

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
- **Ship a cosmetic feature flag (§1.4).** `MULTI_TENANCY_MODE` is the reference
  example: an env var that changes what the UI OFFERS and never what the data
  model supports. Reference: `src/lib/tenancy.ts`.
  - **Two booleans, not a three-way switch at each call site.** `orgsEnabled`
    ("does this exist?") and `orgsExposed` ("do we push it?"). Every surface
    answers one of those two questions, and `optional` is precisely the row where
    the answers differ — naming them makes the mode table checkable from grep
    output instead of by reading twelve call sites.
  - **The data model does not move.** Every business row keeps its
    `organization_id` XOR `account_id` owner in all three modes; no query changes,
    no migration runs, and `disabled` writes nothing. That is what makes the
    switch reversible: turning it back on uncovers UI that was already there over
    rows that were never touched. In `disabled` the sole context is the personal
    account — which already exists for every user — so the mode removes the ORG
    layer, not the tenant layer. A "default organization" holding every user would
    have required a write per user and is exactly what this avoids.
  - **Refuse with `notFound()`, never `forbidden()`.** A 403 means "this exists
    and you may not have it", which is true of RBAC and false of a switched-off
    feature — and a 403 is a page that admits it is there, which does not satisfy
    "completely hidden". `requireOrgsEnabled` in
    `src/features/organizations/context.ts`.
  - **Enforce at the existing chokepoint, not in the proxy.** One call at the top
    of `requireOrgAccess` covers every `/orgs/[slug]/*` page and every action that
    funnels through `requireOrgPermission`. Only three things need their own
    guard: the two actions that legitimately bypass the chokepoint
    (`createOrganizationAction`, `acceptInvitationAction` — no org / no membership
    yet), and `(app)/orgs/layout.tsx` for `/orgs/new`. A 404 from `src/proxy.ts`
    would add a fourth response constructor to a file whose invariant is that all
    three attach the CSP and request id, and would bypass the app's rendering.
  - **⚠️ E2E runs two legs and `reuseExistingServer` must be off in the second.**
    `playwright.config.ts` forces it false outside `required`, or a server already
    on :3000 in the default mode is silently reused and the whole leg asserts
    disabled behaviour against a required-mode server. `ORG_DEPENDENT_SPECS` in
    `e2e/tenancy-fixtures.ts` is a hand-maintained list — a new org-driving spec
    must be added to it.
