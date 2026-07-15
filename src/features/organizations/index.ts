/**
 * Organizations / multi-tenancy feature module (spec 3).
 *
 * Personal accounts vs team organizations, memberships, slug-based routing,
 * team invitations (single-use expiring tokens), member management, and the
 * global account/context switcher (active tenant for the session).
 *
 * Every query originating here MUST be scoped by the active tenant owner
 * (`organization_id` / `account_id`) in the data-access layer — the UI is never
 * the security boundary (spec 1.3, 11.2).
 *
 * Barrel exports only the isomorphic (client+server safe) pieces. Server-only
 * modules are imported from their own paths to keep server code out of client
 * bundles: actions (`./actions`), context guards (`./context`), data (`./data`),
 * and UI components (`./components/*`).
 */

export * from "./schema";
export { slugify } from "./slug";
export { AccountSwitcher } from "./components/account-switcher";
