### Two session mechanisms: staff and parents (langlion §2.19, F3)

There are **two unrelated ways to be signed in**, and code that confuses them is
the failure this section exists to prevent.

|            | Staff (owner/admin/reception/trainer)    | Parent (`client`)                                          |
| ---------- | ---------------------------------------- | ---------------------------------------------------------- |
| Identity   | Better Auth `user` + `membership`        | domain `client`, unique per `(organizationId, email)`      |
| Credential | password / OAuth                         | 6-digit OTP, emailed, scoped to `(organizationId, email)`  |
| Session    | Better Auth `session`                    | `client_session` row + opaque cookie (`ll_client_session`) |
| Gate       | `requireSession`, `requireOrgPermission` | `requireClient(organizationId)`                            |
| Reaches    | `/dashboard`, `/orgs/…`, `/admin`        | nothing under those — parents have no RBAC role at all     |

A parent is **not** a `user` with fewer permissions; there is no `membership`
row, no role, and nothing in `features/client-auth/` grants staff access. The
reason is a business requirement rather than a schema preference: from a parent's
point of view Academy A and Academy B are unrelated businesses, so the same
address at two academies is two logins (spec rewizja 14.1, the fourth deliberate
departure from the boilerplate).

**`requireClient` takes an `organizationId`, and that is not boilerplate.** There
is no answer to "who is signed in" without naming the academy: one cookie
resolves to a parent at the academy that issued it and to nobody anywhere else.
The lookup is tenant-scoped, so a foreign cookie finds no row rather than being
filtered out afterwards.

**Why the session is a row and not a signed cookie.** A signed cookie carrying
`{clientId, organizationId, exp}` needs no table and no read — and cannot be
revoked, so "log out" and "this parent's access ends now" both become "wait for
the expiry you already granted". Second reason, specific to now: §2.19 rests
isolation on a cookie scoped per host, but **the subdomain middleware does not
exist yet (F5)**, so every academy answers on one host and cookie scope isolates
nothing. With the owner on the row, `organizationId` decides — before the
middleware and after it, where host scoping becomes a second, independent layer.

Until F5, one browser holds one academy at a time (signing in at B overwrites the
cookie for A). That is a dev/E2E wrinkle, not an isolation hole.

**One-time codes are consumed by a single conditional UPDATE** — never a SELECT
followed by an UPDATE (decyzja D38). Two requests carrying the same code would
both observe `consumedAt IS NULL` under READ COMMITTED and both proceed; being
inside a transaction does not close that window. Same principle as `FOR UPDATE
SKIP LOCKED` on credit consumption and `FOR UPDATE` on session capacity: the
guarantee lives in the database. `e2e/langlion-client-auth.spec.ts` fires two
simultaneous redemptions and asserts exactly one session exists afterwards.

**The row-level attempt cap is load-bearing, not belt-and-braces.** The rate
limiter in front of it fails open when its store is unavailable — correct for a
password form, where argon2 still stands behind it, and wrong for six digits with
nothing behind them. `client_otp.attempts` is enforced inside the UPDATE, so a
store outage cannot lift it.

### Host resolution and the tenant header (langlion §2.27, F4.5)

Academies live at `{organization.subdomain}.langlion.pl`; the platform apex
(`langlion.pl`) carries marketing, org onboarding and the super-admin panel. The
tenant therefore arrives in the **`Host` header**, and resolving it is split
across two layers on purpose:

| Layer                                     | Does                                                        | Does NOT           |
| ----------------------------------------- | ----------------------------------------------------------- | ------------------ |
| `src/proxy.ts` + `src/lib/tenant-host.ts` | parse `Host` → label; publish it as `x-org-subdomain`       | touch the database |
| `features/organizations/served-org.ts`    | resolve label → `organization` row (`servedOrganization()`) | decide routing     |

Since F4.6 the **staff panel is host-addressed too**: `{subdomain}/dashboard/…`
replaced `/orgs/[slug]/…`, `requireOrgAccess()` takes no argument and reads the
academy from the request, and the organization switcher is gone (§2.19 exception
#5 — each academy is a separate authentication, cookies stay host-scoped, and
academy hosts are covered by Better Auth `trustedOrigins`, **not** by a cookie
domain). Cross-origin URLs are built at request time in `src/lib/tenant-url.ts`,
never from the build-frozen `NEXT_PUBLIC_APP_URL`.

**Why the proxy does not do the lookup.** Its whole design rests on being fast
and edge-safe with no DB (see the file header), and the matcher covers nearly
every request — including apex requests, where no academy exists at all. Next's
own docs say the same: _"Proxy is not intended for slow data fetching."_ The
consequence is worth stating because it reads as a gap: the proxy **cannot tell a
real academy from a typo**, and must not try. Both forward; the unknown one 404s
in the request layer.

**An unknown academy is a 404, never a redirect to the apex.** Wildcard DNS means
every label answers, so a 30x would turn any `*.langlion.pl` into a link landing
on our marketing site — a supply of plausible URLs on our own domain — and would
show a parent following a stale flyer a product pitch instead of an answer.

⚠️ **`x-org-subdomain` is a client-settable header, and `forward()` deletes it
unconditionally before setting its own value.** It names the tenant for every
downstream reader, so a conditional delete would let a caller select an academy
by asking. `LOCALE_HEADER` gets the same treatment for the same reason (it was
previously set conditionally, which left the client's value intact on `/api/*` —
cosmetic for locale, an isolation hole for a tenant).

**Reserved path prefixes** live in `src/features/cms/reserved-slugs.ts`, with a
`stage` marking where each is served: `tenant`, `apex`, or `both`. That list is
**not** the same as `RESERVED_SUBDOMAINS` in `src/lib/validation/primitives.ts`;
see the header of either file for why merging them is a bug that looks like
tidying.

⚠️ **`both` is not a convenience — it is the safe form of the panel migration
(F4.6).** The apex branch in `src/proxy.ts` returns `forward()` **early** for
`tenant`-stage prefixes, which skips `isPublicBarePage` and default-deny below
it. That is harmless only where no apex route exists to render: `zapisy` 404s
from the app router. `/dashboard` has a route, so marking it `tenant` — which is
what the pre-F4.6 comments proposed — forwards an anonymous request into the
page. Mutation-tested consequence: the panel is **not** exposed, because every
page under it carries its own `requireSession`/`requireOrgAccess` (§4.2 holds),
but the edge guard stops being the first line and the refusal loses its locale
(`/login?callbackUrl=%2Fdashboard` instead of `/en/login?callbackUrl=%2Fen%2Fdashboard`).
A prefix that is guarded **and** has a route must be `both`, never `tenant`.
Pinned by a test in `e2e/langlion-subdomain-routing.spec.ts` that a mutation to
`tenant` must break.

⚠️ **The proxy does not run on every render.** A `redirect()` issued from a
Server Action is resolved by Next internally — the target renders in the same
cycle, without a fresh request — so neither the locale prefix nor
`x-org-subdomain` is applied. This shipped once as "signing in on an academy host
shows the personal dashboard until you reload". Two consequences to respect:
a redirecting action must **not** emit a bare path (see `finishSignIn` in
`src/features/auth/actions.ts`), and `servedSubdomain()` treats the header as a
**fast path** with a `parseHost(Host)` fallback — the same function on the same
input, not a second copy of the rule.

**Staff session handoff (F5.5, decyzja D74) is a one-time addition to THIS
mechanism, not a third session system.** Creating an organization or accepting
an invitation lands on the apex directory (D71 — the cookie is host-scoped, so
redirecting straight into `{subdomain}` would show a login screen seconds after
signing in). The directory's link to that ONE academy carries a short-lived
(3-minute), single-use token (`staff_session_handoff`, hashed like
`invitation.tokenHash`) that a custom Better Auth endpoint
(`/api/auth/staff-handoff/verify`) redeems into a NEW session on that host via
`internalAdapter.createSession` + `setSessionCookie` — the same primitives the
built-in `magic-link` plugin uses, so the cookie's shape and host-scoping (D70)
come from the same code as every other sign-in. It is not a shared session
across hosts: each host still gets its own session row, and the token only
skips re-entering credentials for a person already authenticated seconds
earlier. See `docs/plan/faza-5.5.md` for the mechanism's full decisions
(D74, D81–D83), including the prefetch-safety check (an existing valid session
on the redeeming host is ridden without touching the token) and the
host-match validation (a token is refused on any host other than the academy
it was minted for).

**Local dev and E2E** use `APP_ROOT_DOMAIN=localtest.me`, a public DNS name whose
every label resolves to 127.0.0.1 — so `acme.localtest.me:3000` works with no
`/etc/hosts` entry, and the browser sees real distinct origins (which is what
makes cookie-scoping assertions mean anything). `next dev` additionally needs
those origins in `allowedDevOrigins`; E2E runs `next start` and would not catch a
mistake there.

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

**This collides with multi-host tenancy, and F4.5 deliberately did not resolve
it.** Since academies live on their own subdomains, a single build-time origin
cannot be canonical for all of them. It is harmless today because everything that
consumes `absoluteUrl()` still belongs to the apex: the staff panel lives there,
mailed links point there, and academy pages are 404s with nothing to canonicalize.
It stops being harmless in two places, both later: **F4.6** (the panel moves to
tenant hosts, so invitation and verification links must follow) and the **CMS
module** (real pages need per-tenant canonical tags and sitemaps). Both will need
a request-aware variant of `absoluteUrl()`.

Note the asymmetry: redirects built in `src/proxy.ts` use `new URL(…,
request.url)` and therefore follow the incoming `Host` on their own. This problem
belongs strictly to URLs built from env.
