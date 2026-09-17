# ADR-0004: Billing webhook transport (raw-proxy, Stripe direct)

- **Status:** accepted
- **Date:** 2026-09-17
- **Context:** product code (boilerplate for developers)

## Context

After faza 2.5 the webhook is verified and processed in Nest
(`POST /v1/billing/webhook`). Two consumers need to reach it: Stripe (the
provider dashboard points at a URL) and the E2E suite, which speaks only the
web origin (`/api/billing/webhook`, asserting `{received, status}`) and must
stay unchanged to remain a conformance test rather than a mirror of the
implementation.

## Decision

Both. Stripe points at Nest directly (no extra hop on the production path);
the web route stays as a thin RAW-byte relay (status + body pass-through) for
the suite and any previously configured dashboard URL. Raw, never
re-serialized: the HMAC covers the exact bytes, so the relay forwards the
`ArrayBuffer` with the `stripe-signature` header untouched — the `api()`
client must NOT be used here, it would JSON-encode the body and break every
signature.

## Consequences

- The relay carries no logic and needs no maintenance; deleting it later is a
  one-file change plus a suite repoint (a 2.8/2.9 cleanup candidate, not this
  phase).
- Checkout/portal stay behind same-origin web routes for the same reason (plus
  the proxy's 307 for anonymous users); the buttons are unchanged.

## Alternatives considered

- Deleting the web route and repointing the suite at Nest: breaks the
  "suite unchanged" rule that makes E2E a migration proof (fazy 2.1–2.4).
  Rejected for this phase; legitimate as later cleanup.
