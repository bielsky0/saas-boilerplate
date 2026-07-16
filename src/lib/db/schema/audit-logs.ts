import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Admin audit log (spec 6.3 — critical admin actions).
 *
 * An append-only ledger of who did what to whom, and when. Rows are never
 * updated and never deleted by application code. Written by
 * `src/features/admin/audit.ts`; see that module's header for the two write
 * rules (same-transaction for our own effects, audit-first for the engine's).
 *
 * TENANT-ISOLATION CARVE-OUT (spec 1.3 / 11.2) — the SECOND documented
 * exception, alongside the identity tables in `./auth`. This table has no
 * tenant-owner column because a super-admin action is cross-tenant by
 * definition, and may concern no tenant at all (impersonating a user who
 * belongs to no organization). The boundary that replaces the owner filter is
 * `requireSuperAdmin()` — see the header of `src/features/admin/data.ts`.
 *
 * Three shape decisions worth defending, because each looks wrong at a glance:
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
 * `action` is the neutral `AuditAction` union from `src/features/admin/audit.ts`
 * — never a vendor error/event string.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    action: text("action").notNull(),
    actorUserId: text("actorUserId").references(() => user.id, { onDelete: "set null" }),
    actorEmail: text("actorEmail").notNull(),
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
  ],
);
