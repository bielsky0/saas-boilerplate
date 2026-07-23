import { check, foreignKey, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { classSession } from "./class-sessions";
import { groupType } from "./group-types";
import { organization } from "./organizations";

/**
 * Grade field — the definition of one column of the e-dziennik (langlion §2.33,
 * EPIK 35, v16).
 *
 * Configurable at two levels, both live from Faza 6 (open point #11 resolved
 * with the user: full type catalog + both configuration scopes at once, not a
 * narrower start):
 *   - per `group_type` — the field applies to every session of that offer.
 *   - per `class_session` — an ad-hoc field for one specific occurrence.
 * Exactly one of `groupTypeId` / `sessionId` is set, enforced by
 * `grade_field_owner_ck` below — the XOR shape already used for the billing
 * tables' owner columns (`billing_customer_owner_ck` et al., see
 * `./billing-customers`), applied here to two scope columns instead of two
 * tenant-owner columns.
 *
 * `fieldType` union (resolved with the user, spec §8 #11): "numeric" | "scale" |
 * "text". `minValue`/`maxValue` are meaningful only for "numeric"/"scale" and are
 * validated in the zod layer (`features/grades/schema.ts`), not here.
 *
 * `sessionId` is `ON DELETE CASCADE`: an ad-hoc field defined on one session has
 * no meaning once that session is gone, and its `grade` rows cascade in turn via
 * `grade.gradeFieldId`'s own `ON DELETE CASCADE` — deleting a session removes the
 * ad-hoc field and everything entered against it in one statement, rather than
 * leaving either an orphaned field or a dangling `grade` row.
 */
export const gradeField = pgTable(
  "grade_field",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    groupTypeId: text("groupTypeId"),
    sessionId: text("sessionId"),
    name: text("name").notNull(),
    fieldType: text("fieldType").$type<"numeric" | "scale" | "text">().notNull(),
    /** Only meaningful for "numeric"/"scale"; validated at the zod layer. */
    minValue: integer("minValue"),
    maxValue: integer("maxValue"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("grade_field_id_org_uq").on(t.id, t.organizationId),
    check(
      "grade_field_owner_ck",
      sql`(${t.groupTypeId} IS NULL) <> (${t.sessionId} IS NULL)`,
    ),
    foreignKey({
      columns: [t.groupTypeId, t.organizationId],
      foreignColumns: [groupType.id, groupType.organizationId],
      name: "grade_field_group_type_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.sessionId, t.organizationId],
      foreignColumns: [classSession.id, classSession.organizationId],
      name: "grade_field_session_fk",
    }).onDelete("cascade"),
    index("grade_field_org_idx").on(t.organizationId),
    index("grade_field_group_type_idx").on(t.groupTypeId),
    index("grade_field_session_idx").on(t.sessionId),
  ],
);
