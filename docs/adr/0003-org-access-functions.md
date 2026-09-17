# ADR-0003: Org access as functions, not a Guard class

- **Status:** accepted
- **Date:** 2026-09-17
- **Context:** product code (boilerplate for developers)

## Context

`docs/etap-2.md` (faza 2.2) specified an `OrgPermissionGuard` — a port of the
web app's `requireOrgPermission`. In implementation, three flows needed three
shapes of the same check: full org+permission (`requireOrgContext`),
membership-only with a personal fallback (notifications reads), and
nullable-permission with a personal fallback (storage). A single Guard class
cannot serve all three without a nullable-personal escape hatch that defeats
its purpose, and Nest guards cannot easily return the resolved
`{ org, membership, role }` the handlers need next.

## Decision

One function, `requireOrgMember(db, session, slug, orgsEnabled, permission?)`
in `apps/api/src/tenancy/access.ts`, plus shared query helpers
(`getOrgBySlug`, `getMembership`, `getPersonalAccountByUserId`,
`getOrCreatePersonalAccount`) in the same file. `tenancy/` is not a Nest
module — plain functions taking `db`, no DI graph, no cycle. Callers
(`organizations.service`, `tenancy/owner`) delegate; they own no query.

## Consequences

- Exactly one definition of each lookup and each 404/403 semantic. A future
  FastAPI backend ports one file.
- Faza 2.5's `resolveBillingOwner` uses `requireOrgMember` with
  `billing.manage` from day one — no fourth variant.
- Do NOT reintroduce per-flow copies of the org/membership lookup, even when
  a flow "only needs a small tweak" — extend `requireOrgMember` instead.

## Alternatives considered

- `OrgPermissionGuard` (plan literal): wrong shape for personal-fallback flows
  and returns boolean where handlers need the resolved org. Rejected after
  contact with `resolveStorageOwner`.
- `@Injectable OrgAccessService`: DI buys nothing here (no dependencies beyond
  `db`, which callers already hold) and would pull `tenancy/` into the module
  graph. Revisit only if the guard grows dependencies.
