import { auditLog, type Db } from "@repo/db";
import type { RequestSession } from "../auth/auth-engine";

/**
 * Audit trail writer (spec 6.3 → 6.4) — the Nest twin of the web app's
 * `features/admin/audit.ts`.
 *
 * Same two write rules (see that module's header for the full reasoning):
 * - Rule A (our effect): `recordAudit(tx, …)` INSIDE the same transaction.
 * - Rule B (engine effect): not needed in this module — every org mutation is
 *   ours, so every call site below is Rule A.
 *
 * One deliberate difference from web:
 * - No `next/headers` ambient read: `recordAudit` takes `ipAddress`/`userAgent`
 *   explicitly (nullable). Callers pass what their request carries; jobs pass
 *   null. Evidence, never a control — a missing header never stops the action.
 */

export const AUDIT_ACTIONS = [
  // §6.3 — super-admin panel actions (written by the admin module, listed here
  // so the vocabulary stays in one place).
  "user.suspend",
  "user.unsuspend",
  "user.delete",
  "organization.delete",
  "superadmin.grant",
  "superadmin.revoke",
  // §6.4 — tenant membership + invitation lifecycle (this module).
  "member.invite",
  "member.join",
  "member.role_change",
  "member.remove",
  "member.leave",
  "invitation.revoke",
  // §6.4 — tenant lifecycle (this module).
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

/** WHO acted, as a kind — §6.4's actor model (see the web module header). */
export type ActorType = "User" | "System" | "AIAgent" | "Admin";

export interface AuditActor {
  actorType: ActorType;
  /** Null only for `System` — there is no user row behind a cron job. */
  actorId: string | null;
  actorEmail: string;
}

/** The sentinel email for `System` — a real value, never NULL (see web header). */
export const SYSTEM_ACTOR_EMAIL = "system@internal";

export const SYSTEM_ACTOR: AuditActor = {
  actorType: "System",
  actorId: null,
  actorEmail: SYSTEM_ACTOR_EMAIL,
};

/**
 * The actor behind a request-scoped mutation: the calling user, always.
 * Pure function of the session — no DB read, so call sites need no
 * transaction ordering around it.
 */
export function resolveActor(session: RequestSession): AuditActor {
  return { actorType: "User", actorId: session.user.id, actorEmail: session.user.email };
}

/** One field's before/after, as stored in `metadata.changes`. */
export type FieldChange = { from: unknown; to: unknown };

/**
 * Field-level diff for §6.4's "stara wartość → nowa wartość". Returns
 * `undefined` when nothing differs — check it, so a no-op write logs nothing.
 */
export function changed<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: readonly (keyof T)[],
): Record<string, FieldChange> | undefined {
  const changes: Record<string, FieldChange> = {};
  for (const field of fields) {
    if (!Object.is(before[field], after[field])) {
      changes[String(field)] = { from: before[field], to: after[field] };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

export interface AuditEntry {
  action: AuditAction;
  actor: AuditActor;
  /**
   * REQUIRED, never optional — the type-system substitute for §6.4's
   * data-layer hook. Write `null` only when the event genuinely has no tenant.
   */
  organizationId: string | null;
  targetType: AuditTargetType;
  targetId: string;
  /** Human-readable snapshot of the target: an email, or an org slug. */
  targetLabel: string;
  metadata?: Record<string, unknown>;
}

/** Minimal surface shared by `db` and a transaction handle. */
export type AuditWriter = Pick<Db, "insert">;

/**
 * Append one entry. Pass a transaction handle for Rule A, plain `db` for Rule B.
 * Snapshots (`actorEmail`/`targetLabel`) are stored, never resolved at read time.
 */
export async function recordAudit(
  writer: AuditWriter,
  entry: AuditEntry,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  await writer.insert(auditLog).values({
    action: entry.action,
    actorType: entry.actor.actorType,
    actorUserId: entry.actor.actorId,
    actorEmail: entry.actor.actorEmail,
    organizationId: entry.organizationId,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    metadata: entry.metadata ?? null,
    ipAddress: request?.ipAddress ?? null,
    userAgent: request?.userAgent ?? null,
  });
}
