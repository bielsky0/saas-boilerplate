/**
 * RBAC role→permission map (spec 4.1) — the Nest twin of the web app's
 * `features/rbac/index.ts`.
 *
 * The SINGLE source of truth for what each predefined role may do on the API
 * side. Copied, not imported: `apps/web` is not a dependency of `apps/api`
 * (packages only flow outward from `@repo/*`), and the map is small, stable,
 * and asserted on by the same E2E suite (`rbac-enforcement`) on both sides —
 * a drift breaks the suite before it breaks a tenant. Custom per-org roles
 * (§4.3) would layer a DB-backed map over this same shape.
 */

/** Predefined roles, lowest to highest privilege. */
export const ROLES = ["member", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Atomic permissions — discrete actions a role may perform. Add new capabilities
 * here and grant them in `ROLE_PERMISSIONS`; never inline a role check elsewhere.
 */
export type Permission =
  | "members.invite"
  | "members.remove"
  | "members.update_role"
  | "invitations.revoke"
  | "organization.update"
  | "organization.delete"
  | "organization.leave"
  | "storage.upload"
  | "storage.delete"
  | "audit.read"
  | "billing.manage";

/** role → permissions. Owner is a superset; Admin manages members; Member reads. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    "members.invite",
    "members.remove",
    "members.update_role",
    "invitations.revoke",
    "organization.update",
    "organization.delete",
    "organization.leave",
    "storage.upload",
    "storage.delete",
    "audit.read",
    "billing.manage",
  ],
  // Admin manages people and settings, but NOT money (`billing.manage` is
  // owner-only: it authorizes spending, a different kind of authority from
  // managing colleagues — same conservative default as in web).
  admin: [
    "members.invite",
    "members.remove",
    "members.update_role",
    "invitations.revoke",
    "organization.update",
    "organization.leave",
    "storage.upload",
    "storage.delete",
    "audit.read",
  ],
  // Members may upload content, but not delete other people's files. NOT granted
  // `audit.read` (§6.4): the trail records who removed whom, which is management
  // information, not content.
  member: ["organization.leave", "storage.upload"],
};

/** True if `role` grants `permission`. Pure — safe for guards and services. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Narrow an arbitrary string (e.g. a DB `role` column) to a known `Role`. */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
