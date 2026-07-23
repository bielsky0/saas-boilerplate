import { foreignKey, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { booking } from "./bookings";
import { gradeField } from "./grade-fields";
import { organization } from "./organizations";
import { user } from "./auth";

/**
 * Grade — one participant's entered value for one `grade_field` (langlion §2.33,
 * EPIK 35, v16).
 *
 * `value` is stored as `text` regardless of `gradeField.fieldType` (repo
 * convention: no `pgEnum`, and here no per-type column either) — validated and
 * parsed against the field's type/min/max in the zod layer
 * (`features/grades/schema.ts`), not enforced by the column type. This mirrors
 * `booking.paymentStatus` and friends: the database stores the union member as
 * text, the app layer is the source of truth for which members are valid.
 *
 * Both foreign keys cascade: deleting the `grade_field` this value was entered
 * against (e.g. as part of a cascaded `class_session` deletion for an ad-hoc
 * field, see `./grade-fields`) removes the value with it, and so does deleting
 * the `booking` it was entered for. Neither half of `booking_athlete_no_overlap_excl`
 * nor any other tenant EXCLUDE constraint is affected — `grade` does not
 * participate in it (§5.3 lists only `booking`'s own columns).
 */
export const grade = pgTable(
  "grade",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    gradeFieldId: text("gradeFieldId").notNull(),
    bookingId: text("bookingId").notNull(),
    value: text("value").notNull(),
    enteredByUserId: text("enteredByUserId").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("grade_id_org_uq").on(t.id, t.organizationId),
    /** One participant has at most one value per field — re-entering overwrites, per DoD. */
    unique("grade_field_booking_uq").on(t.gradeFieldId, t.bookingId),
    foreignKey({
      columns: [t.gradeFieldId, t.organizationId],
      foreignColumns: [gradeField.id, gradeField.organizationId],
      name: "grade_grade_field_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [booking.id, booking.organizationId],
      name: "grade_booking_fk",
    }).onDelete("cascade"),
    index("grade_org_idx").on(t.organizationId),
    index("grade_grade_field_idx").on(t.gradeFieldId),
    index("grade_booking_idx").on(t.bookingId),
  ],
);
