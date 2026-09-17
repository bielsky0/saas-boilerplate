# ADR-0001: Jobs module as the dependency hub (registry via token)

- **Status:** accepted
- **Date:** 2026-09-17
- **Context:** product code (boilerplate for developers)

## Context

Every background job (`email.send`, `onboarding.step`, `billing.notify`,
`notification.create`, `job.prune`, `storage.purge`, `ratelimit.prune`) is
executed by the drain in `apps/api/src/jobs`. NestJS resolves handlers through
constructor DI, so something must wire each handler service into the drain.
The web app (faza 1–2.3) did it the other way round: features imported the
queue (`enqueueJob`) and a `Record<JobName, handler>` registry wired them
without the jobs module knowing any feature.

## Decision

`JobsModule` imports the five feature modules (`Emails`, `Onboarding`,
`Notifications`, `BillingNotify`, `Storage`) and builds the `JOB_REGISTRY`
provider from their services via a `useFactory` + injection token
(`apps/api/src/jobs/registry-token.ts`, `jobs.module.ts`). The registry stays
`Record<JobName, _>`, so a job name with no handler is a compile error. The
token (not a direct service import) is what avoids a service-level cycle.

## Consequences

- Adding a job = adding a module import + a registry line. Deliberate, greppable.
- The dependency arrow points jobs → features (opposite of the web app's
  features → jobs). Accept the asymmetry: it is forced by Nest DI, and the
  token keeps it acyclic.
- Do NOT "simplify" the token into direct handler imports in `JobsService` —
  that reintroduces the cycle the token exists to avoid.

## Alternatives considered

- Features registering themselves into jobs (web-style): needs a mutable
  global registry or `forwardRef` spiderweb in Nest; worse than the hub.
- One module per job handler with dynamic discovery: magic for a boilerplate
  whose readers must see the wiring.
