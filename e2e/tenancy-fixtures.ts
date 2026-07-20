/**
 * Multi-tenancy mode E2E env + spec selection (spec 1.4).
 *
 * The flag is COSMETIC — it hides the org layer, it does not change the data
 * model — so the only honest way to prove that is to boot the app in both modes
 * and see the same database behave the same way underneath. Hence two CI legs
 * (see .github/workflows/ci.yml) driven by MULTI_TENANCY_MODE on the runner.
 *
 * What CANNOT be asserted, and why the task's original acceptance criterion was
 * revised: "every spec passes in both modes" is unachievable by construction —
 * 13 of the 30 specs drive org UI that `disabled` hides by definition. So the
 * `required` leg runs everything (the default, unchanged), and the `disabled` leg
 * runs the org-independent specs plus multi-tenancy-mode.spec.ts, which asserts
 * the hiding itself.
 *
 * Imported by playwright.config.ts, so this file must stay free of any
 * `@playwright/test` import at module scope (same rule as rate-limit-fixtures).
 */
export type TenancyMode = "required" | "optional" | "disabled";

export const TENANCY_MODE = (process.env.MULTI_TENANCY_MODE ?? "required") as TenancyMode;

export const E2E_TENANCY_ENV = { MULTI_TENANCY_MODE: TENANCY_MODE } as const;

/**
 * Specs that cannot run without organizations — excluded in the `disabled` leg.
 *
 * ⚠️ HAND-MAINTAINED COUPLING. A new org-driving spec that nobody adds here fails
 * in the `disabled` leg — loudly and correctly, but with a message about a 404
 * rather than about this list. The criterion since F4.6: a spec belongs here if
 * it calls `seedOrg`/`seedOrgFull`, signs in with `loginToAcademy`, or addresses
 * an academy host at all. It is no longer "visits `/orgs/`" — that path now holds
 * only `/orgs/new`, and the panel moved to `{subdomain}/dashboard`.
 *
 * A `@orgs` tag on every `test()` title would give the same guarantee, but needs
 * edits across 13 files instead of one reviewable list.
 */
export const ORG_DEPENDENT_SPECS = [
  "admin-access",
  "billing-checkout",
  "billing-webhook",
  "emails-transactional",
  "invitation-accept",
  "langlion-credits",
  "langlion-schedule",
  "mcp",
  "notifications",
  "onboarding-sequence",
  "org-audit-trail",
  "org-last-owner",
  "protected-redirect",
  "rbac-enforcement",
  "storage-isolation",
  "tenant-host-isolation",
  "validation",
].map((name) => `**/${name}.spec.ts`);
