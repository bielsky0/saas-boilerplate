import { foreignKey, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { client } from "./clients";
import { organization } from "./organizations";

/**
 * Athlete — the child who attends (langlion §1.2).
 *
 * Belongs to a parent (`client`), not to a login of its own: children never
 * authenticate. One parent may have several, which is what makes the "family
 * wallet" possible — a credit with a NULL `athleteId` is spendable on any of
 * this parent's children (§2.4, US-7.4).
 *
 * `age` is optional by design (§1.2). An academy that does not collect it should
 * not be made to invent it.
 *
 * `organizationId` is not in the spec's column list for this table (decyzja D9);
 * see the note in `group-type-recurrences.ts` for why every business table here
 * carries one. It is also what `max_students` counts against in F9 (§2.20).
 */
export const athlete = pgTable(
  "athlete",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    parentClientId: text("parentClientId").notNull(),
    name: text("name").notNull(),
    age: integer("age"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
  },
  (t) => [
    unique("athlete_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.parentClientId, t.organizationId],
      foreignColumns: [client.id, client.organizationId],
      name: "athlete_parent_client_fk",
    }).onDelete("cascade"),
    index("athlete_org_idx").on(t.organizationId),
    index("athlete_parent_idx").on(t.parentClientId),
  ],
);
