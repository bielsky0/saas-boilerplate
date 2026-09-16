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

## Queue rows a backend must write (delivery stays shared until etap 2.3)

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
- After every enqueue the backend kicks the drain owner best-effort (today:
  the web `/api/cron/jobs`; etap 2.3 moves the drain into the backend — the
  kick is transitional). Cron is the guarantee; the kick is latency.

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
