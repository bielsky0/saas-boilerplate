import { foreignKey, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { booking } from "./bookings";
import { organization } from "./organizations";
import { user } from "./auth";

/**
 * Progress note — free-text note about a participant's progress (langlion
 * §2.33, EPIK 35, v16), independent of `grade_field`/`grade`: a note is not tied
 * to any configured field, just to the booking it concerns.
 *
 * Unlike `grade`, there is no uniqueness constraint here — a booking can carry
 * any number of notes over time (a running log), whereas a grade field holds one
 * current value per participant (see `./grades`). Overwriting an existing note
 * is a client-level edit action, not a schema-level upsert.
 *
 * `ON DELETE CASCADE` on `bookingId`: a note about a booking has no meaning once
 * that booking is gone.
 */
export const progressNote = pgTable(
  "progress_note",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    bookingId: text("bookingId").notNull(),
    content: text("content").notNull(),
    enteredByUserId: text("enteredByUserId").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [booking.id, booking.organizationId],
      name: "progress_note_booking_fk",
    }).onDelete("cascade"),
    index("progress_note_org_idx").on(t.organizationId),
    index("progress_note_booking_idx").on(t.bookingId),
  ],
);
