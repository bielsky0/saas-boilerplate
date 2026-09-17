# Backend implementation contract (framework independence)

Any backend serves any frontend. This document is what "any backend" means:
the behavior a NestJS, FastAPI, or hand-rolled implementation must reproduce
so that the web app (Next.js today, Vue tomorrow) and the E2E suite work
against it unchanged.

The suite is the conformance test: it speaks only HTTP against documented
origins, so it already runs against Nest with zero test changes (faza 2.1
proved it). A new backend is done when the suite is green against it.

Related: [ARCHITECTURE.md](ARCHITECTURE.md) (principles, cookie contract §6),
[etap-2.md](etap-2.md) (which module moves in which phase — each phase extends
the "Implemented" section below), `@repo/contracts` (the types).

## Conventions every endpoint follows

- Base path `/v1/*`. JSON everywhere, `content-type: application/json`.
- Error envelope `{ error, issues? }` — `issues` is a `field → messages` map,
  present on schema failures (spec 22.2).
- Statuses: `400` malformed, `401` unauthenticated, `403` forbidden, `404`
  not found, `409` conflict (last-owner), `422` schema failure, `429` limited
  (with `Retry-After` delta-seconds, never 0).
- Auth-flavored failures use `{ ok: false, code }` with a neutral,
  vendor-free `code` (`INVALID_CREDENTIALS`, `WEAK_PASSWORD`,
  `INVALID_TOKEN`, `ACCOUNT_SUSPENDED`, `RATE_LIMITED`, `UNKNOWN`).
- The browser calls the API directly (`credentials: include`, CORS with an
  explicit origin). The API never serves HTML to API clients; redirects exist
  only on the emailed-link hops, and always target absolute caller URLs.

## Implemented: auth (faza 2.1) + notifications-read + health

- `POST /v1/auth/sign-up` `{email, password, name?}` → `200 {ok: true}`
  (also for an already-registered email — no session then), `400`
  `{ok:false,code:WEAK_PASSWORD}`, `422` envelope, `429`
  `{ok:false,code:RATE_LIMITED}` on the IP-keyed gate. Sets the session
  cookie on success (auto sign-in). Stamps `user.locale` from the request
  locale, but ONLY on genuine creation and ONLY when the column is NULL.
- `POST /v1/auth/sign-in` `{email, password}` → `200 {ok: true, locale}`.
  Validation failures, unknown emails and wrong passwords are all `401`
  `{ok:false,code:INVALID_CREDENTIALS}` — one code, indistinguishable.
  Suspended/deleted (correct credentials only) is `403`
  `{ok:false,code:ACCOUNT_SUSPENDED}` and does NOT consume the limiter.
  `locale` is the stored choice or `null` (never a default — the client
  backfills nothing).
- `POST /v1/auth/sign-out` → `200 {ok:true}`, always (idempotent), clears
  the session cookie via `Set-Cookie`.
- `POST /v1/auth/password-reset/request` `{email, redirectTo?}` → `200
{ok:true}` for every input, including unknown and malformed addresses —
  or this endpoint becomes the account oracle. Consumes the limiter silently;
  when blocked it still answers success and simply does not send.
- `POST /v1/auth/password-reset/confirm` `{token, newPassword}` → `200
{ok:true}`; `400 INVALID_TOKEN` (expired/used/forged — all one code);
  `400 WEAK_PASSWORD`; `422` envelope. Revokes every live session.
- `GET /v1/auth/verify-email?token=&callbackURL=` → thin alias for the
  engine hop below (API clients that cannot follow the emailed link).
- `GET /v1/session` → the contract `Session` as JSON, or `401`. Soft-deleted
  accounts resolve to `401` (live sessions die on next use, structurally).
- Emailed hops (served by the backend's auth engine over HTTP): the
  verification link validates the token, sets the session cookie
  (`autoSignInAfterVerification`) and 302s to the absolute caller
  `callbackURL`; failures append `?error=CODE` to it. The reset link
  validates and 302s to the absolute reset page with `?token=` (or
  `?error=INVALID_TOKEN`). Relative callbacks MUST be resolved against the
  CALLER's origin, never the API's.
- Login rate limit (spec 2.1): peek-before-hash, consume on
  `INVALID_CREDENTIALS` only, reset on success. Bucket key is IP-only, never
  the submitted email — the load-bearing half of anti-enumeration. Numbers
  (5 attempts / 15 min) are operator policy; the shape is this document.
- Notifications read (faza 2.0 slice): `GET /v1/notifications`,
  `PATCH /v1/notifications/:id/read`, `PATCH /v1/notifications/read-all` —
  session-guarded, owner-scoped, `422` on malformed `slug`/`id`.
- `GET /v1/health` → `{ok:true}`, no auth, no database.

## Implemented: organizations (faza 2.2, REST wg OpenAPI)

Source of truth: `packages/contracts/openapi.yaml` + DTO
`packages/contracts/src/organizations.ts`. Full nouns, verbs only via HTTP
methods — no `/invite`, `/revoke`, `/leave`, `/accept` RPC suffixes.

- `POST /v1/organizations` `{name, slug?}` → `201 {id, name, slug}`,
  `422` envelope. Derives slug when omitted (`resolveUniqueSlug`).
- `GET /v1/organizations` → `200 {items: OrganizationWithRole[]}` (switcher).
- `GET /v1/organizations/{slug}` → `200 {id, name, slug, role}`,
  `404` unknown slug or `MULTI_TENANCY_MODE=disabled` (indistinguishable).
- `PATCH /v1/organizations/{slug}` `{name?, newSlug?}` → `200 {id, name, slug}`;
  taken slug → `409 {error: SLUG_TAKEN}` (incl. soft-deleted orgs — the unique
  constraint spans them); `422` envelope.
- `DELETE /v1/organizations/{slug}` → `204` (soft-delete + audit
  `organization.delete`).
- `GET /v1/organizations/{slug}/members` → `200 {items: Member[]}`.
- `PATCH /v1/organizations/{slug}/members/{memberId}` `{role}` → `200 Member`;
  demote of the last active owner → `409 {error: LAST_OWNER}`.
- `DELETE /v1/organizations/{slug}/members/{memberId}` → `204`; remove of the
  last active owner → `409 LAST_OWNER`.
- `DELETE /v1/organizations/{slug}/membership` (leave own) → `204`;
  last-owner-leave → `409 LAST_OWNER`. Separate resource because `member.leave`
  ≠ `member.remove` (actor = target, distinct audit actions).
- `POST /v1/organizations/{slug}/invitations` `{email, role}` → `201 Invitation`.
  Token SHA-256 + TTL 7d, link from `NEXT_PUBLIC_APP_URL`. Mail is enqueue-only
  (`email.send` + `notification.create` rows in the same transaction — delivery
  moves in faza 2.3).
- `GET /v1/organizations/{slug}/invitations?status=pending` → `200 {items}`.
- `DELETE /v1/organizations/{slug}/invitations/{invitationId}` → `204`,
  idempotent (already-revoked also `204`, no audit row — the `.returning()`
  rule from web `revokeInvitationAction`).
- `POST /v1/invitations/{token}/accept` → `200 {slug}` (client navigates);
  non-pending/expired/forged → `400 {error: INVALID_TOKEN}` (one code).
  Bearer-token accept by the authenticated session holder.
- `GET /v1/organizations/{slug}/audit-logs?q=&from=&to=&page=` → `200
{items, page, hasNext}` (tenant-scoped, guard `audit.read`,
  `changes{from→to}` in `metadata`).
- Guard (all org routes): `OrgPermissionGuard` = port of `requireOrgPermission`
  (`404` no org/disabled, `403` non-member/unknown role/missing permission).
- Compat alias: `POST /v1/orgs` → `308` to `/v1/organizations` for one phase,
  then deleted (no dual implementation).

## Implemented: jobs + emails + onboarding + cron (faza 2.3)

The drain moved into the backend. Same table, same row shapes as before —
what changed is who executes them.

- Queue: claim `FOR UPDATE SKIP LOCKED` (`pending`/`running` + `runAt` past
  = due; `runAt` is the visibility timeout, the claim is the reaper),
  handlers run OUTSIDE the claim transaction, backoff `30s·4^(n-1)` with full
  jitter capped at 1h, dead-letter at `maxAttempts` (default 5), success
  scrubs `payload` to `{}` (invitation links must not rest in the table).
- `email.send` handler: transactional templates send as-is (no suppression,
  no `List-Unsubscribe`); everything else passes the send-time suppression
  guard (the enqueue-time check is only an optimization) and carries an
  injected `unsubscribeUrl` + `List-Unsubscribe` / `List-Unsubscribe-Post`
  headers. A suppressed send is a SUCCESSFUL no-op, never a retry.
  Templates render via `@react-email/render` in the recipient's
  enqueue-time `locale` (a plain string in the payload; missing/stale values
  fall back to English, never fail the send).
- `onboarding.step`: all three steps upfront (`welcome` day 0, `tips` day 3,
  `features` day 7, each with `dedupeKey` `onboarding:{userId}:{step}`),
  run-time interrupt on `hasPaidSubscription` (personal OR member of a paying
  org), unknown step / missing recipient = success no-op. The handler
  enqueues the `email.send` child (two hops, one delivery path).
- `notification.create` handler: send-time in-app suppression check, then
  exactly one owner set; suppressed = success no-op. Idempotent via the
  job's per-recipient `dedupeKey`.
- `billing.notify`: fan-out into per-recipient `email.send` +
  `notification.create` children (per-child dedupe keys); re-reads the
  current subscription row before confirming (watermark guard against
  out-of-order events); no recipients = success, not failure.
- `job.prune` / `storage.purge` / `ratelimit.prune`: cron-shaped; purge is
  object-first-then-row with per-org `retention.purge` audit rows.
- `GET /v1/cron/jobs` (bearer `CRON_SECRET`, timing-safe; no secret → `404`,
  bad token → `401`): self-enqueues the daily/hourly housekeeping
  (deduped by date/hour) and answers `{ claimed, succeeded, retried,
deadLettered, queue }`.
- `PUT /v1/notifications/preferences` `{preferences: {type: boolean}}`
  (session-guarded; unknown/non-suppressible types ignored) → `{ok:true}`;
  `GET /v1/notifications/preferences` → `{preferences}` (stored deviations
  only; absent = enabled).
- `POST /v1/unsubscribe?e=&c=&t=` (RFC 8058, HMAC, no session): genuine link
  → suppress + `200 {unsubscribed:true}`; malformed/forged → `400`
  `{error: INVALID...}` with one message for both (no oracle).
- After every enqueue the backend kicks its OWN drain best-effort
  (in-process, post-response); cron is the guarantee, the kick is latency.

## Auth formats a reimplementation must reproduce (the true lock-in)

Endpoints are the easy half. A backend that does not reuse Better Auth must
reproduce these formats, or existing users cannot sign in:

- **Password hashes**: scrypt (Better Auth 1.6.x defaults) in the
  `account.password` column. A new backend verifies against the stored
  hashes — provide test vectors before switching, or run a password-migration
  campaign (reset flow) instead of pretending compatibility.
- **Sessions**: opaque random token in the `session` table (`token` unique),
  presented as the session cookie; expiry in `expiresAt`. Rolling/refresh
  semantics follow the engine: a live session of a soft-deleted (`deletedAt`)
  or banned user resolves to nothing.
- **Verification tokens**: JWT (HS256, engine secret), payload `{email}` (+
  `updateTo`/`requestType` for email-change flows), single-use, expiry per
  flow. Reset tokens: single-use rows with a 1-hour TTL.
- **Super-admin flag**: the string `user.role` (`superadmin` member), never a
  second boolean column that could drift from the gate reading it.

## Queue rows a backend must write (delivery lives in the backend since 2.3)

- `email.send` `{template, data, to, name?, locale}` — locale as a plain
  string, captured at enqueue time (the drain has no request to ask).
- `notification.create` `{userId, organizationId|null, accountId|null,
type, params, link?}` — exactly one owner set.
- `onboarding.step` `{userId, step}` — all three steps upfront with
  `runAt` + per-step `dedupeKey` (`onboarding:{userId}:{step}`), never chained.
- `dedupeKey` is globally unique (`onConflictDoNothing`): a redelivery adds
  no row. Payloads are JSON primitives only.
- Signup enqueues `verify-email` (+ personal-account scoping + a
  `verify-email` notification deduped on the token URL); verification starts
  the onboarding sequence (safe to fire twice — the dedupe keys carry the
  guarantee); password-reset request enqueues `password-reset`.
- After every enqueue the backend kicks its own drain best-effort (cron is
  the guarantee; the kick is latency).

## Conformance harness (test-only, non-production)

A backend passes the suite only if it also implements the harness the suite
drives (all 404 in production):

- `POST /v1/dev/seed-user` `{email, password, name?}` — same engine path as
  sign-up, anti-enumerating (`{ok:true}` for duplicates), locale stamped
  from the forwarded cookie.
- `GET /v1/dev/user?email=` → `{id, emailVerified}` (the seeder cannot
  return the id — same reason).
- `POST /v1/dev/rate-limit` `{provider, key, limit, windowMs, times, reset,
prune}` — drives either store directly (sequential consumes + peek +
  prune report), bypassing policy on purpose.
- `GET /v1/dev/emails?to=` → `{emails}` (the log-adapter outbox, latest
  first; `url` + `headers` carried per message for link/header assertions).
- `POST /v1/dev/emails/fail-next` `{to, times=1}` → `{to, pending}` (per
  address outage simulator; missing `to` → `400`).
- `GET /v1/dev/jobs?dedupeKeyPrefix=&to=&id=` → `{jobs, queue}` (job rows
  with `payload` exposed so the success-path scrub is assertable).
- `POST /v1/dev/jobs/run` `{dedupeKeyPrefix?, jobIds?, fastForward?}` →
  `{fastForwarded, claimed, succeeded, retried, deadLettered}`
  (`budgetMs: 20s`; `fastForward: true` requires a scope → else `400`).
- `GET /v1/dev/notifications?email=` → `{notifications}` (across owners;
  unknown user → `{notifications: []}`).
- `POST /v1/dev/notification-preference` `{email, type, inAppEnabled}` →
  `{ok:true}` (`400` on shape/unknown type, `404` on unknown user).

## For create-boilerplate-app (the selection matrix)

- A frontend needs: `@repo/api-client` (zero-deps, vendors verbatim) +
  `@repo/contracts` + `@repo/validation` (zod, framework-free) + the public
  env contract (API base URL) + this document's cookie section + the locale
  convention (URL prefix + explicit header, no shared cookie jar).
- A backend provides: this whole document. Choosing the auth library is an
  internal decision — nothing outside the backend's adapter directory may
  import it (enforced by `no-restricted-imports` in both apps' eslint configs
  - `scripts/package-boundaries.mjs` for package direction).
- The database schema (Drizzle `packages/db`, migrations as SQL) is the
  shared artifact across backends; the ORM is not.
