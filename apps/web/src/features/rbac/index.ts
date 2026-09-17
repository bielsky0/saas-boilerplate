/**
 * RBAC feature module (spec 4 — role-based access control).
 *
 * Back-compat shim — the source of truth moved to `@repo/contracts/rbac`
 * (single-sourced for web + api, so the two maps can never drift apart).
 * UI code keeps importing `@/features/rbac`; enforcement stays backend-side
 * (spec 4.2) — `hasPermission` here is cosmetic only.
 *
 * Predefined roles only for this phase; custom per-org roles (§4.3) are a future
 * extension that would layer a DB-backed role→permission map over this same shape.
 */
export * from "@repo/contracts/rbac";
