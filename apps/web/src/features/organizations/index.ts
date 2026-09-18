/**
 * Organizations / multi-tenancy feature module (spec 3).
 *
 * Personal accounts vs team organizations, memberships, slug-based routing,
 * team invitations (single-use expiring tokens), member management, and the
 * global account/context switcher (active tenant for the session).
 *
 * Faza 2.8: reads and writes live in Nest (`apps/api/src/organizations`,
 * OpenAPI `packages/contracts/openapi.yaml` is the source of truth). The
 * browser forms call Nest directly (`client.ts` beside the components);
 * server components resolve the tenant over HTTP (`context.ts` via
 * `@/lib/api`). Tenant scoping is enforced in Nest's data layer, never the
 * UI (spec 1.3, 11.2).
 *
 * Barrel exports only the isomorphic (client+server safe) pieces. Server-only
 * modules are imported from their own paths to keep server code out of client
 * bundles: the context guard (`./context`), the browser client (`./client`),
 * and UI components (`./components/*`).
 */

export * from "./schema";
export { slugify } from "./slug";
export { AccountSwitcher } from "./components/account-switcher";
