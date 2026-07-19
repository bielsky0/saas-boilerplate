import {
  boolean,
  date,
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
import { location } from "./locations";
import { organization } from "./organizations";

/**
 * Weekly pattern under a group type (langlion §1.2, §2.2).
 *
 * One group type can carry several of these in parallel — Monday 17:00 with
 * trainer A and Wednesday 18:00 with trainer B are two patterns of one offer
 * (US-2.3), and credits of that type work on both. Saving one with
 * `isRecurring` schedules the season generation job; there is no separate
 * "Generate" button (US-3.1/AC1).
 *
 * TIME IS WALL-CLOCK HERE, INSTANT IN `session`. `startTime` is `"HH:MM"` local
 * to `organization.timezone`, and `dayOfWeek`/`startDate` are local too. The
 * generator converts them to UTC instants when it materialises sessions — see
 * `features/schedule/recurrence.ts`, which exists precisely so that conversion
 * survives DST. The name collision with `session.startTime` (a timestamptz) is
 * unfortunate and load-bearing to understand: they are different kinds of thing.
 *
 * `organizationId` is not in the spec's §1.2 column list for this table (decyzja
 * D9). It is here because every business table needs an indexed owner
 * (`schema/index.ts` header) and because an RLS policy without a local owner
 * column would have to run a subquery per row.
 */
export const groupTypeRecurrence = pgTable(
  "group_type_recurrence",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    groupTypeId: text("groupTypeId").notNull(),
    /** 0 = Sunday … 6 = Saturday, in `organization.timezone`. */
    dayOfWeek: integer("dayOfWeek").notNull(),
    /** `"HH:MM"` local wall clock — see header. */
    startTime: text("startTime").notNull(),
    durationMinutes: integer("durationMinutes").notNull(),
    /**
     * Staff are boilerplate users (§2.19), so this is a plain FK — `user` has no
     * organization column to pair with. That the trainer actually belongs to this
     * academy is a `membership` question, enforced in the application layer.
     */
    trainerId: text("trainerId").references(() => user.id, { onDelete: "restrict" }),
    capacity: integer("capacity").notNull(),
    /** Overrides `groupType.defaultLocationId` when set (§2.12). */
    locationId: text("locationId"),
    isRecurring: boolean("isRecurring").notNull().default(false),
    /** Required when `isRecurring`; validated in the zod layer. */
    occurrencesCount: integer("occurrencesCount"),
    startDate: date("startDate", { mode: "string" }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
  },
  (t) => [
    unique("gtr_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.groupTypeId, t.organizationId],
      foreignColumns: [groupType.id, groupType.organizationId],
      name: "gtr_group_type_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.locationId, t.organizationId],
      foreignColumns: [location.id, location.organizationId],
      name: "gtr_location_fk",
    }).onDelete("set null"),
    index("gtr_org_idx").on(t.organizationId),
    index("gtr_group_type_idx").on(t.groupTypeId),
  ],
);
