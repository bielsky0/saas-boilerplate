import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { organization } from "./organizations";

/**
 * System + tenant audit trail (spec 6.3 → 6.4 — full accountability ledger).
 *
 * An append-only ledger of who did what to whom, and when. Rows are never
 * updated and never deleted by application code. Written by
 * `src/features/admin/audit.ts`; see that module's header for the two write
 * rules (same-transaction for our own effects, audit-first for the engine's).
 *
 * THE NULLABLE TENANT OWNER (spec 1.3 / 11.2) — this is the ONE table in the
 * schema where the owner column is nullable, and the exemption is narrow and
 * specific. Everywhere else, an owner is a PRECONDITION of writing the row: you
 * cannot create a file or an invitation without knowing whose it is. Here the
 * tenant is a FACT ABOUT THE EVENT, and some events legitimately have no tenant
 * — impersonating a user who belongs to no organization, granting a system-level
 * super-admin flag. A NOT NULL column would force those writes to invent an
 * owner, which is worse than recording the truth that there isn't one.
 *
 * Consequently there are now TWO read boundaries, not one:
 *   - `requireSuperAdmin()` for the unfiltered, cross-tenant read
 *     (`src/features/admin/data.ts`) — global insight, §6.4.
 *   - `organizationId = ctx.org.id` behind `requireOrgPermission(slug,
 *     "audit.read")` for the tenant read
 *     (`src/features/organizations/audit-data.ts`) — an org's own admins reading
 *     their own slice, which is what makes this a RODO control rather than an
 *     internal debugging tool.
 *
 * (This header previously argued the table should have NO owner column, on the
 * grounds that a super-admin action is cross-tenant by definition. That was true
 * of the §6.3 scope — eight panel actions — and stopped being true at §6.4, when
 * the ledger widened to cover ordinary tenant mutations like a role change. The
 * old reasoning is preserved here rather than deleted because the nullable owner
 * only makes sense against it.)
 *
 * Four shape decisions worth defending, because each looks wrong at a glance:
 *
 * 1. `actorUserId` is `onDelete: "set null"` — never `cascade`, never
 *    `restrict`. Cascade would erase the trail the moment the admin it
 *    incriminates is purged, and the log exists precisely to outlive its
 *    subjects; `restrict` would make the §11.3 purge impossible. `set null`
 *    plus the `actorEmail` SNAPSHOT is the only combination where the trail
 *    survives erasure of the actor. Same reasoning `subscription` uses for its
 *    denormalized owner: the record must outlive what it points at.
 *
 * 2. The target is polymorphic (`targetType` + `targetId`) with NO foreign key.
 *    Do NOT "fix" this to match `webhook_event`'s two-nullable-columns-plus-
 *    CHECK shape — that precedent looks right here and is self-contradictory:
 *    XOR columns only earn their keep with FKs, an FK on an append-only ledger
 *    must be `set null` for purge to work, and `set null` breaks the XOR CHECK.
 *    Snapshot + free-form id is correct, and it absorbs new target types
 *    without a migration.
 *
 * 3. `actorEmail`/`targetLabel` are snapshots, deliberately denormalized. A log
 *    that renders "(deleted user)" for both sides of an incident is not an
 *    audit log. They record what was true AT THE TIME, which is also what makes
 *    the row readable after a purge.
 *
 * 4. `organizationId` is `onDelete: "set null"` for exactly the reason
 *    `actorUserId` is (argument 1), and the consequence is deliberate: when an
 *    org is hard-purged, its audit rows survive but become visible only to a
 *    super admin. That is correct — the tenant read boundary exists to serve the
 *    org's own admins, and after a purge there are none left to serve.
 *
 * `action` is the neutral `AuditAction` union from `src/features/admin/audit.ts`
 * — never a vendor error/event string. `actorType` is `ActorType` from the same
 * module: who the actor IS (User / System / AIAgent / Admin), which is a
 * different question from who they are, and the one §6.4 asks.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    action: text("action").notNull(),
    actorType: text("actorType").notNull(),
    actorUserId: text("actorUserId").references(() => user.id, { onDelete: "set null" }),
    actorEmail: text("actorEmail").notNull(),
    /** Nullable by design — see the header. Null means "this event has no tenant". */
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "set null",
    }),
    targetType: text("targetType").notNull(),
    targetId: text("targetId").notNull(),
    targetLabel: text("targetLabel").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt.desc()),
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_target_idx").on(t.targetType, t.targetId),
    // Composite, in this order: the tenant read is always `WHERE organizationId = $1
    // ORDER BY createdAt DESC`, so the equality column leads and the sort column
    // follows in its scan direction. No index on `actorType` — four values is no
    // selectivity, and the planner would ignore it.
    index("audit_log_org_created_idx").on(t.organizationId, t.createdAt.desc()),
  ],
);
