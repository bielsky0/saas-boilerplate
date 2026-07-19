import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { groupType } from "./group-types";
import { groupTypeRecurrence } from "./group-type-recurrences";
import { location } from "./locations";
import { organization } from "./organizations";

/**
 * Class session — the REALISATION half of Zasada nadrzędna #1 (langlion §1.2, §2.2).
 *
 * A concrete event in the calendar. Once generated it lives its own life: editing
 * the pattern it came from does not retroactively rewrite it, and
 * `generatedFromRecurrenceId` records provenance without implying synchronisation.
 *
 * NAMED `class_session`, NOT `session`. The spec calls this entity `session`, but
 * Better Auth already owns both the table name `session` and the TS export
 * `session` (`./auth`). The collision is not loud: `export *` from two modules
 * exporting the same name makes it ambiguous, and ES modules resolve that by
 * silently omitting it — so `drizzle-kit generate` quietly skipped this table
 * while still emitting `booking`'s foreign key against the AUTH session table.
 * A migration that attaches bookings to login sessions is not a failure mode
 * worth leaving reachable, hence the rename. Every reference in the langlion spec
 * to `session` means this table.
 *
 * ⚠️ COLUMNS PROTECTED BY AN OBJECT DRIZZLE CANNOT SEE. `trainerId`, `startTime`,
 * `endTime` and `status` participate in the `class_session_trainer_no_overlap_excl`
 * EXCLUDE constraint, which is hand-written SQL in the migration because Drizzle
 * has no representation for EXCLUDE. It is therefore absent from
 * `migrations/meta/*_snapshot.json`. Consequences, in order of how likely they
 * are to bite:
 *   1. `drizzle-kit generate` diffs TS against the snapshot, never against the
 *      live database, so it will never propose dropping the constraint. Safe.
 *   2. `drizzle-kit push` DOES introspect the database and WOULD propose dropping
 *      it. `push` is banned in this repo — there is no `db:push` script, and
 *      docs/ARCHITECTURE.md says so.
 *   3. A future migration that ALTERs the TYPE of any column named above will
 *      either fail or drop the constraint by cascade. Re-add it explicitly.
 *
 * `startTime`/`endTime` are `timestamptz`, deliberately unlike the bare
 * `timestamp()` used elsewhere in this schema. `tstzrange()` requires it, §1.2
 * specifies UTC instants, and — the reason it matters most — a naive `timestamp`
 * behaves correctly on a machine running in UTC and silently wrongly on one that
 * is not, with nothing to indicate which you have.
 *
 * `organizationId` is denormalised from the group type. It is set from the
 * `withTenant` context, never from caller input, and RLS `WITH CHECK` plus the
 * composite foreign keys below make a mismatched value unrepresentable (§1.3).
 */
export const classSession = pgTable(
  "class_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    groupTypeId: text("groupTypeId").notNull(),
    trainerId: text("trainerId").references(() => user.id, { onDelete: "restrict" }),
    startTime: timestamp("startTime", { withTimezone: true }).notNull(),
    endTime: timestamp("endTime", { withTimezone: true }).notNull(),
    /** Copied from the pattern at generation time; editable per session (US-14.4). */
    capacity: integer("capacity").notNull(),
    locationId: text("locationId"),
    status: text("status").$type<"scheduled" | "cancelled">().notNull().default("scheduled"),
    generatedFromRecurrenceId: text("generatedFromRecurrenceId"),
    /**
     * Set when an admin edits this session's time or location directly rather
     * than through its pattern (US-3.4/AC9). A bulk update from the pattern skips
     * such rows so a deliberate manual fix is never silently overwritten (AC8).
     * Force Override does NOT set it (AC10) — that flag answers "was this hand-
     * adjusted", not "was something unusual done here".
     */
    isManuallyAdjusted: boolean("isManuallyAdjusted").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("class_session_id_org_uq").on(t.id, t.organizationId),
    /**
     * §4.4 — idempotent generation. Re-running the season job inserts only the
     * dates that are missing (US-3.2/AC2). Manually created sessions carry a NULL
     * `generatedFromRecurrenceId` and never collide here, which is correct: NULLs
     * are distinct in a Postgres unique index, and two ad-hoc sessions at the same
     * instant are a legitimate thing to have.
     */
    unique("class_session_recurrence_start_uq").on(t.generatedFromRecurrenceId, t.startTime),
    /**
     * The target of `booking`'s composite FK (decyzja D4). Widening the tuple to
     * include the times is what lets a booking's denormalised copy of them be
     * maintained by ON UPDATE CASCADE instead of by everyone remembering to.
     */
    unique("class_session_id_org_time_uq").on(t.id, t.organizationId, t.startTime, t.endTime),
    foreignKey({
      columns: [t.groupTypeId, t.organizationId],
      foreignColumns: [groupType.id, groupType.organizationId],
      name: "class_session_group_type_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.generatedFromRecurrenceId, t.organizationId],
      foreignColumns: [groupTypeRecurrence.id, groupTypeRecurrence.organizationId],
      name: "class_session_recurrence_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.locationId, t.organizationId],
      foreignColumns: [location.id, location.organizationId],
      name: "class_session_location_fk",
    }).onDelete("set null"),
    index("class_session_org_start_idx").on(t.organizationId, t.startTime),
    index("class_session_group_type_idx").on(t.groupTypeId),
  ],
);
