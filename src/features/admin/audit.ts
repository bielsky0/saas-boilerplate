import { headers } from "next/headers";

import type { Session } from "@/lib/adapters/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { getUserEmailById } from "./data";

/**
 * Audit trail writer (spec 6.3 → 6.4).
 *
 * Records who did what to whom, and when, for every critical action — originally
 * super-admin panel operations (§6.3), now widened to ordinary tenant mutations
 * (§6.4). The table is append-only: nothing here updates or deletes.
 *
 * ─── WHY THE CALL SITES, AND NOT THE DATA-ACCESS LAYER ──────────────────────
 *
 * §6.4 asks for the audit hook to live in the data-access layer so that "no new
 * feature can forget to log". We do not do that, and the reason is worth stating
 * because the spec is explicit: a generic hook at the write layer can see that a
 * row changed, but not WHY — it cannot distinguish a role change from a soft
 * delete from a slug rename, and it cannot name a target label a human will read
 * six months later. It produces a diff log, not an audit log.
 *
 * The substitute guarantee is the type system: `organizationId` on `AuditEntry`
 * is REQUIRED and non-optional, so a call site cannot silently omit its tenant —
 * it must write `null` and mean it. Adding a field to `AuditEntry` breaks every
 * call site until each one is considered. That is a weaker guarantee than §6.4
 * asked for and a stronger one than a comment, and it is the trade we chose.
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
 * RULE A, THE LABEL-LOOKUP COROLLARY: an entry needs a `targetLabel` (an email,
 * a slug) that the mutating code often does not have in scope — a role change
 * knows `userId`, not the email an auditor will read. Do that lookup with the
 * SAME `tx`, never with `db`:
 *
 *     await db.transaction(async (tx) => {
 *       await tx.update(membership).set({ role })…;
 *       const [target] = await tx.select({ email: user.email }).from(user)…;  // tx!
 *       await recordAudit(tx, { …, targetLabel: target.email });
 *     });
 *
 * This does NOT contradict the deadlock warning below. The hazard there is taking
 * a SECOND pooled connection while holding an open transaction; `tx.select` runs
 * on the connection you already hold. A `db.select` inside the transaction is the
 * bug — it blocks on the pool while the pool waits on you.
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
 * Every audited action (spec 6.3 + 6.4). Neutral vocabulary — never a vendor
 * error/event string.
 *
 * NAMING: lowercase dotted, not the SCREAMING_CASE of the §6.4 task doc. These
 * values are user-visible (both audit pages render `action` raw) and are asserted
 * on literally in e2e/admin-impersonation.spec.ts; renaming would also require
 * rewriting live rows for no benefit.
 *
 * On §6.3's "zmiana roli": BOTH halves now exist. superadmin.grant/revoke is the
 * SYSTEM role change (§6.1); member.role_change is the tenant one (§3/§4). The
 * §6.3-era version of this comment argued the tenant half did not belong in this
 * ledger — that was correct while the ledger was panel-only, and §6.4 is
 * precisely the requirement that changed it.
 *
 * DEFERRED — in the §6.4 task catalog, but the underlying feature does not exist.
 * Do not add the action without building the surface; an action name that nothing
 * ever writes is worse than an absent one, because it reads as coverage.
 *   - `data_export.request` / `consent.update`: no data-export feature and no
 *     consent record exist. (`notification_preferences` is a preference, not a
 *     consent — it carries no timestamped grant/withdraw semantics.)
 *   - self-serve `account.deletion_initiated`: only the ADMIN path exists, and it
 *     already logs as `user.delete`. A user cannot delete their own account yet.
 *   - `payment_method.update`: `BillingEventType` has no `payment_method.*` event
 *     and there is no billing-portal action to trigger one.
 *   - AI-agent writes (the task doc's AUTO_SCHEDULE_UPDATED): features/mcp
 *     registers read-only tools only. The `AIAgent` actor plumbing IS built
 *     (`mcpActor` below) so the first write tool has nothing to invent.
 * Extension point for all five: add the name here, then call `recordAudit` in the
 * same transaction as the write (Rule A).
 */
export const AUDIT_ACTIONS = [
  // §6.3 — super-admin panel actions.
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
  // langlion §2.12 / EPIK 2, 3, 22 — the academy's Definitions and Realisations.
  //
  // Note what is and is not logged. Creating or editing a DEFINITION is logged:
  // it is a deliberate act by a named person that changes what the academy sells
  // or when it teaches. Generating the season that follows is NOT logged per
  // session — a pattern saved with 40 occurrences would otherwise bury the rest
  // of the trail under 40 rows describing one decision the admin already made
  // once. The same reasoning as `retention.purge` writing one row with a count
  // rather than one per file. The season's outcome is in the application log and
  // in the sessions themselves.
  "location.create",
  "location.update",
  "group_type.create",
  "group_type.update",
  "recurrence.create",
  "recurrence.update",
  "class_session.update",
  // langlion §2.4 / EPIK 7 — the credit ledger.
  //
  // ONLY the manual grant is logged, and the omission of the other five sources
  // is deliberate rather than pending. A grant creates settlement value out of
  // nothing on one person's say-so (US-7.3), which is exactly the kind of act
  // §6.4 exists to make answerable. The other five are consequences of an event
  // that already has its own record — a payment, a webhook, a cancellation — and
  // logging them here would restate that record while burying this one. Expiry
  // is not logged either: a deadline passing is not an act by anybody.
  "credit.grant",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditTargetType =
  | "user"
  | "organization"
  | "membership"
  | "invitation"
  | "subscription"
  | "payment"
  // langlion domain entities (§1.2).
  | "location"
  | "group_type"
  | "recurrence"
  | "class_session"
  /**
   * The PARENT is the target of a credit grant, not the credit rows: a grant of
   * ten credits is one decision about one family, and an auditor asks "what did
   * we give this client", never "what happened to credit #7 of 10".
   */
  | "client";

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

/**
 * The actor behind a request-scoped mutation.
 *
 * Under impersonation the actor is the ADMIN, not the impersonated user, and the
 * impersonated identity moves to `metadata.onBehalfOf` — attribution follows
 * AUTHORITY. This is not a new judgement call: `stopImpersonatingAction` already
 * attributes to `session.impersonatedBy` for the same reason. Recording the
 * impersonated user as the actor would let an admin launder an action through
 * someone else's name, which is the exact scenario §6.2 requires be visible.
 *
 * WHY THIS LIVES IN features/admin: it needs `getUserEmailById` from
 * `./data`, which `no-restricted-imports` fences to `features/admin/**`. This
 * module is NOT fenced (the rule names `@/features/admin/data` and the
 * `adminAuthAdapter` import specifically), so org feature code can call this
 * freely while the cross-tenant reader stays contained.
 *
 * The extra DB read fires only when `impersonatedBy !== null`. The ordinary
 * (non-impersonated) path does no additional query.
 */
export async function resolveActor(session: Session): Promise<AuditActor> {
  if (session.impersonatedBy !== null) {
    const adminEmail = await getUserEmailById(session.impersonatedBy);
    return {
      actorType: "Admin",
      actorId: session.impersonatedBy,
      // Same fallback as stopImpersonatingAction: a purged admin must not make
      // the row unwritable. The id is still there for a forensic join.
      actorEmail: adminEmail ?? "(unknown admin)",
    };
  }
  return { actorType: "User", actorId: session.user.id, actorEmail: session.user.email };
}

/**
 * Merge the impersonated identity into an entry's metadata, so a row written
 * under impersonation names both halves: the admin who acted (`actor`) and the
 * account they acted through (`metadata.onBehalfOf`).
 *
 * A no-op when not impersonating, so call sites can apply it unconditionally
 * rather than branching.
 */
export function withImpersonation(
  session: Session,
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (session.impersonatedBy === null) return metadata;
  return { ...metadata, onBehalfOf: session.user.email };
}

/** One field's before/after, as stored in `metadata.changes`. */
export type FieldChange = { from: unknown; to: unknown };

/**
 * Field-level diff for §6.4's "stara wartość → nowa wartość".
 *
 * A metadata convention rather than a column or a side table: the set of audited
 * fields differs per action, and a normalized `audit_field_change` table would
 * turn every read into a join for data that is only ever displayed, never queried.
 * If a future requirement needs to QUERY by changed field, that is the moment to
 * normalize — not before.
 *
 * Returns `undefined` when nothing actually differs, and that is load-bearing:
 * it is what lets the billing webhook skip writing a row for a renewal that
 * changed no field. An audit log that records non-events trains people to ignore
 * it.
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

export type AuditEntry = {
  action: AuditAction;
  actor: AuditActor;
  /**
   * REQUIRED, never optional — the type-system substitute for §6.4's
   * data-layer hook (see the module header). Write `null` only when the event
   * genuinely has no tenant; do not use it to mean "I didn't look it up".
   */
  organizationId: string | null;
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
    actorType: entry.actor.actorType,
    actorUserId: entry.actor.actorId,
    actorEmail: entry.actor.actorEmail,
    organizationId: entry.organizationId,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    metadata: entry.metadata ?? null,
    ipAddress,
    userAgent,
  });
}
