/**
 * Audit trail vocabulary (spec 6.3 → 6.4).
 *
 * Faza 2.6: the WRITER moved to Nest (`apps/api/src/organizations/audit.ts`,
 * used by every API module including `admin/`). The full reasoning — why call
 * sites and not the data-access layer, Rule A (same-transaction) vs Rule B
 * (audit-first, then the engine) — lives in that module's header now; this
 * file keeps the shared VOCABULARY the tenant UI renders
 * (`orgs/[slug]/settings/audit` reads `AUDIT_ACTIONS` to label rows).
 *
 * The table is append-only: nothing updates or deletes audit rows.
 */

/**
 * Every audited action (spec 6.3 + 6.4). Neutral vocabulary — never a vendor
 * error/event string.
 *
 * NAMING: lowercase dotted, not SCREAMING_CASE. These values are user-visible
 * (both audit pages render `action` raw) and are asserted on literally in
 * e2e/admin-impersonation.spec.ts; renaming would also require rewriting live
 * rows for no benefit.
 *
 * On §6.3's "zmiana roli": BOTH halves exist. superadmin.grant/revoke is the
 * SYSTEM role change (§6.1); member.role_change is the tenant one (§3/§4).
 *
 * DEFERRED — named in the §6.4 catalog, but the underlying feature does not
 * exist. Do not add the action without building the surface; an action name
 * that nothing ever writes is worse than an absent one.
 *   - `data_export.request` / `consent.update`: no data-export feature and no
 *     consent record exist. (`notification_preferences` is a preference, not a
 *     consent — it carries no timestamped grant/withdraw semantics.)
 *   - self-serve `account.deletion_initiated`: only the ADMIN path exists, and
 *     it already logs as `user.delete`. A user cannot delete their own account
 *     yet.
 *   - `payment_method.update`: `BillingEventType` has no `payment_method.*`
 *     event and there is no billing-portal action to trigger one.
 *   - AI-agent writes: features/mcp registers read-only tools only. The
 *     `AIAgent` actor plumbing IS built (`mcpActor` below) so the first write
 *     tool has nothing to invent.
 * Extension point for all five: add the name here, then call `recordAudit` in
 * the API in the same transaction as the write (Rule A).
 */
export const AUDIT_ACTIONS = [
  // §6.3 — super-admin panel actions (written by the API admin module).
  "impersonation.start",
  "impersonation.stop",
  "user.suspend",
  "user.unsuspend",
  "user.delete",
  "organization.delete",
  "superadmin.grant",
  "superadmin.revoke",
  // §6.4 — tenant membership + invitation lifecycle.
  "member.invite",
  "member.join",
  "member.role_change",
  "member.remove",
  "member.leave",
  "invitation.revoke",
  // §6.4 — tenant lifecycle.
  "organization.create",
  "organization.update",
  // §6.4 — billing (§5). Written by the webhook, never by a user request.
  "subscription.change",
  "payment.record",
  // §6.4 — system retention (§11.3 / §21.4).
  "retention.purge",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditTargetType =
  "user" | "organization" | "membership" | "invitation" | "subscription" | "payment";

/**
 * WHO acted, as a kind — §6.4's actor model. A different question from WHICH
 * actor, and the one an auditor asks first ("did a human do this, or a job?").
 *
 * `Admin` specifically means "a super admin acting through impersonation", not
 * "a super admin". A super admin using the panel normally is also `Admin`; the
 * distinction that matters is authority, not surface.
 */
export type ActorType = "User" | "System" | "AIAgent" | "Admin";

export type AuditActor = {
  actorType: ActorType;
  /** Null only for `System` — there is no user row behind a cron job. */
  actorId: string | null;
  actorEmail: string;
};

/**
 * The sentinel email for `System`. A real column value rather than NULL, because
 * `actorEmail` is NOT NULL and every audit row must render a readable actor —
 * a blank cell in an audit view is indistinguishable from a bug.
 */
export const SYSTEM_ACTOR_EMAIL = "system@internal";

export const SYSTEM_ACTOR: AuditActor = {
  actorType: "System",
  actorId: null,
  actorEmail: SYSTEM_ACTOR_EMAIL,
};

/**
 * The actor for a write performed by an AI agent on a user's behalf (§26.1).
 *
 * The agent has no identity of its own by design: it acts AS `userId`, with
 * exactly that user's permissions, and `actorType` is the only thing that says a
 * machine drove it. §26.1 requires both facts to survive into the trail.
 *
 * Nothing calls this yet — features/mcp exposes read-only tools. It exists so the
 * first write tool has no reason to invent its own actor shape.
 */
export function mcpActor(userId: string, email: string): AuditActor {
  return { actorType: "AIAgent", actorId: userId, actorEmail: email };
}
