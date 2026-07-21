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
