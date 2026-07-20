/**
 * RBAC feature module (spec 4 — role-based access control).
 *
 * The centralized role → permissions map (spec 4.1): the SINGLE source of truth
 * for what each predefined role may do, so authorization is never scattered
 * across components. Enforcement is on the backend (spec 4.2) — see
 * `requireOrgPermission` in `features/organizations/context.ts`, which reads this
 * map and calls Next's `forbidden()` (403) when a permission is missing. UI
 * hiding/disabling uses `hasPermission` cosmetically only.
 *
 * Predefined roles only for this phase; custom per-org roles (§4.3) are a future
 * extension that would layer a DB-backed role→permission map over this same shape.
 */

/**
 * Predefined roles, lowest to highest privilege.
 *
 * The three langlion staff roles (§2.10) sit between `member` and `admin`, and
 * the ordering is a documentation convenience only — nothing computes privilege
 * from the array index. They are SIDEWAYS from each other, not a ladder:
 * reception handles money at the desk, a trainer handles their own sessions, the
 * secretariat handles client requests. Each gets exactly the permissions §2.10
 * names for it and nothing by inheritance.
 *
 * Roles stay STATIC here rather than becoming DB-backed rows (Rozstrzygnięcie #4
 * in docs/plan-implementacji.md). A custom-role mechanism (boilerplate §4.3)
 * would layer over this same shape later without a data migration, because the
 * `membership.role` column already stores the name as text.
 */
export const ROLES = ["member", "trainer", "reception", "secretariat", "admin", "owner"] as const;
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
  | "billing.manage"
  // ── langlion domain permissions (§2.10) ──────────────────────────────────
  //
  // FIRST BATCH ONLY — the ones Faza 2 actually enforces. The spec's §2.10 table
  // names roughly twenty; they arrive with the phase that has a call site to
  // guard, because a permission granted before anything checks it is
  // indistinguishable from one that was forgotten.
  | "locations.manage"
  | "group_types.manage"
  | "sessions.generate_season"
  | "sessions.manage";

/**
 * role → permissions. Owner is a superset; Admin manages members; Member reads.
 *
 * The four langlion permissions are Owner+Admin only, exactly as §2.10 lists
 * them. Note what is deliberately absent from every row: there is no
 * "exceed session capacity" permission and there never will be (US-17.1/AC2) —
 * capacity is guarded by a row lock in a transaction (§5.2), not by a role, so a
 * permission that claimed to override it would be a lie the database refuses to
 * honour. Trainer conflict is the opposite case and gets `sessions.force_override`
 * in F18; capacity gets nothing, ever.
 */
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
    "locations.manage",
    "group_types.manage",
    "sessions.generate_season",
    "sessions.manage",
  ],
  // Admin manages people and settings, but NOT money.
  //
  // `billing.manage` is owner-only alongside `organization.delete`: it authorizes
  // spending the organization's money and changing what it owes every month,
  // which is a different kind of authority from managing colleagues. Chosen as
  // the conservative default because the spec gives no guidance (§4.1 only names
  // the permission) — widening it later is one line, while narrowing it after
  // admins rely on it is a breaking change.
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
    "locations.manage",
    "group_types.manage",
    "sessions.generate_season",
    "sessions.manage",
  ],
  /**
   * The three langlion staff roles (§2.10), all currently carrying only what
   * every member has.
   *
   * They exist NOW, ahead of their permissions, on purpose: `membership.role` is
   * a text column, so a role that does not exist in this map fails `isRole` and
   * lands the holder on a 403 for the entire organization (`requireOrgAccess`).
   * Introducing the names in the phase that invites them, and the grants in the
   * phase that enforces them, keeps those two failure modes apart — an
   * unrecognised role is a locked-out human, a missing permission is one refused
   * button.
   *
   * Where the grants land: `credits.confirm_on_site` and
   * `bookings.mark_attendance` (trainer, own sessions only — enforced in the
   * action, since this map cannot express "own") in F6; `credits.purchase_cash`
   * (reception) in F12; `group_swap.approve` and `credits.reassign_athlete`
   * (secretariat) in F15.
   */
  secretariat: ["organization.leave", "storage.upload"],
  reception: ["organization.leave", "storage.upload"],
  trainer: ["organization.leave", "storage.upload"],
  // Members may upload content, but not delete other people's files.
  //
  // NOT granted `audit.read` (§6.4): the trail records who removed whom and whose
  // role changed, which is management information about colleagues rather than
  // content. Owner/Admin are the roles accountable for those actions and so the
  // ones with standing to review them.
  member: ["organization.leave", "storage.upload"],
};

/** True if `role` grants `permission`. Pure — safe for both UI and backend use. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Narrow an arbitrary string (e.g. a DB `role` column) to a known `Role`. */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
