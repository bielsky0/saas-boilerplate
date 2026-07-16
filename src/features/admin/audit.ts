import { headers } from "next/headers";

import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/**
 * Admin audit log writer (spec 6.3).
 *
 * Records who did what to whom, and when, for every critical admin action. The
 * table is append-only: nothing here updates or deletes.
 *
 * ─── The two write rules ────────────────────────────────────────────────────
 *
 * There are two kinds of admin effect, and they need different orderings. Pick by
 * asking "who owns the database connection the effect runs on?"
 *
 * RULE A — the effect is OURS (soft-deleting a user/org): write the audit row in
 * the SAME transaction as the effect. This is the `webhook_event` precedent: an
 * effect that commits without its ledger row is a failure you cannot detect later.
 *
 *     await db.transaction(async (tx) => {
 *       await tx.update(user).set({ deletedAt: now })…;
 *       await recordAudit(tx, { action: "user.delete", … });
 *     });
 *
 * RULE B — the effect is the AUTH ENGINE'S (impersonate, suspend, unsuspend,
 * setSuperAdmin): a shared transaction is IMPOSSIBLE. `auth.api.banUser` runs
 * through the engine's own internal adapter on its own connection; there is no
 * supported way to hand it our `tx`. So: write the audit row first, in its own
 * transaction, THEN call the effect. Fail closed.
 *
 *     await recordAudit(db, { action: "impersonation.start", … });
 *     const result = await adminAuthAdapter.impersonate(targetId, await headers());
 *
 * The consequences, chosen deliberately:
 *   - audit write throws  → we never impersonate. Acceptance criterion 2 holds
 *     even under failure, which is the whole point of the ordering.
 *   - effect then throws  → a spurious row. THE LOG RECORDS AUTHORIZED INTENT
 *     AND OVER-LOGS RATHER THAN UNDER-LOGS. A row for an action that didn't
 *     happen is a puzzle; a missing row for one that did is a breach you can't see.
 *   - for impersonation this is the only correct order regardless: the effect
 *     swaps the session cookie and the action then redirect()s (which throws), so
 *     auditing afterwards leaves a window with a swapped cookie and no row.
 *
 * CONSIDERED AND REJECTED for Rule B: wrapping the engine call inside an open
 * `db.transaction` so the row commits iff the effect succeeded. It works, and it
 * is tempting. But it holds a pooled connection open across a nested call that
 * takes a SECOND connection from the same pool — a deadlock under the small
 * default pool `postgres(env.DATABASE_URL)` gives us. Not worth it for an action
 * a human performs a handful of times a day.
 *
 * Rule B applies to all four engine-effect actions even where a spurious row is
 * uglier (a phantom "suspend" reads worse than a phantom "impersonate"):
 * consistency beats per-action cleverness in the module auditors read first.
 */

/**
 * Every critical admin action (spec 6.3). Neutral vocabulary — never a vendor
 * error/event string.
 *
 * On §6.3's "zmiana roli": covered by superadmin.grant/revoke. §6.1 defines super
 * admin as a SYSTEM role, so a system role change is precisely the §6-scoped one.
 * Org role changes (§3/§4) are tenant events performed by org admins, not panel
 * actions — logging them here would push a per-tenant event stream into a system
 * ledger.
 *
 * On §6.3's "zmiana planu z poziomu admina": deferred with the feature. §6.2
 * grants the panel no plan-override surface, and building one needs §5.2's
 * pricing model. Extension point: add "plan.change" here and call recordAudit in
 * the same transaction as the subscription write (Rule A).
 */
export const AUDIT_ACTIONS = [
  "impersonation.start",
  "impersonation.stop",
  "user.suspend",
  "user.unsuspend",
  "user.delete",
  "organization.delete",
  "superadmin.grant",
  "superadmin.revoke",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditTargetType = "user" | "organization";

export type AuditEntry = {
  action: AuditAction;
  actorId: string;
  actorEmail: string;
  targetType: AuditTargetType;
  targetId: string;
  /** Human-readable snapshot of the target: an email, or an org slug. */
  targetLabel: string;
  metadata?: Record<string, unknown>;
};

/** Minimal surface shared by `db` and a transaction handle, so callers can pass either. */
type Writer = Pick<typeof db, "insert">;

/**
 * Append one entry. Pass a transaction handle for Rule A, plain `db` for Rule B.
 *
 * `actorEmail`/`targetLabel` are stored as SNAPSHOTS rather than resolved at read
 * time on purpose — see the schema header. A log that renders "(deleted user)"
 * for both sides of an incident is not an audit log.
 */
export async function recordAudit(writer: Writer, entry: AuditEntry): Promise<void> {
  // Request context, best-effort: it is evidence, not a control. Never let a
  // missing header stop the action — but note this means recordAudit must be
  // called from a request scope (server action / route handler).
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = h.get("user-agent");
  } catch {
    // Outside a request scope (e.g. a background job): leave both null.
  }

  await writer.insert(auditLog).values({
    action: entry.action,
    actorUserId: entry.actorId,
    actorEmail: entry.actorEmail,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    metadata: entry.metadata ?? null,
    ipAddress,
    userAgent,
  });
}
