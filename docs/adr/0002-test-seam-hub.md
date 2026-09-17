# ADR-0002: DevModule as the test-seam hub

- **Status:** accepted
- **Date:** 2026-09-17
- **Context:** product code (boilerplate for developers)

## Context

The E2E suite (spec 14.1) drives the backend through test-only seams
(`POST /v1/dev/seed-user`, `/v1/dev/seed-org`, `/v1/dev/jobs/run`, …). Those
seams must reach across features: seeding an org needs `OrganizationsService`,
draining jobs needs `JobsService`, asserting notifications needs
`NotificationsService`. `DevModule` (`apps/api/src/dev/dev.module.ts`)
therefore imports five feature modules.

## Decision

Accept the hub explicitly. `DevModule` may import any feature module; the
controller 404s in production (`assertDev()`), so the hub never ships to prod.
Do NOT refactor it toward "cleanliness" — its job is reach, not layering.

## Consequences

- New E2E seam = new module import in `DevModule`. No ceremony.
- Every seam added here must have a web-side thin proxy with the same contract
  (the suite speaks to web, web forwards to Nest) and must 404 in production.
- If a seam starts carrying product logic instead of test plumbing, that logic
  moves to the owning feature — the seam keeps only the HTTP shape.

## Alternatives considered

- Seams scattered per feature module: harder to audit what ships as 404-gated
  surface; one file listing every test door is a security feature.
