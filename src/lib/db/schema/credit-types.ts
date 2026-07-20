import { foreignKey, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { groupType } from "./group-types";
import { organization } from "./organizations";

/**
 * Credit type — what a credit is good for (langlion §1.2, §2.4).
 *
 * ONE-TO-ONE WITH `group_type`, and that is the entire isolation mechanism of the
 * credit system: a credit of type A is spendable only in groups of type A
 * (US-13.1/AC2). Without it, "one credit = one class" would silently make a
 * trial-lesson credit redeemable against a camp, and the spec's second governing
 * principle (credit as the only settlement currency) would become a way to move
 * value between offers priced differently.
 *
 * The 1:1 is enforced by a unique on `groupTypeId`, not merely by convention. A
 * group type with two credit types would make FIFO consumption ambiguous in a way
 * no error message could explain to an admin.
 *
 * SOFT DELETE, like every other definition-shaped table here (EPIK 20). Retiring
 * a credit type stops new purchases; credits already issued keep working until
 * their own `validUntil` (US-20.1/AC3). Deactivation is deliberately NOT a way to
 * expire outstanding credits — a parent who paid keeps what they paid for.
 */
export const creditType = pgTable(
  "credit_type",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    groupTypeId: text("groupTypeId").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
  },
  (t) => [
    unique("credit_type_id_org_uq").on(t.id, t.organizationId),
    /** The 1:1 of §1.2, as a constraint rather than a comment. */
    unique("credit_type_group_type_uq").on(t.groupTypeId),
    foreignKey({
      columns: [t.groupTypeId, t.organizationId],
      foreignColumns: [groupType.id, groupType.organizationId],
      name: "credit_type_group_type_fk",
    }).onDelete("restrict"),
    index("credit_type_org_idx").on(t.organizationId),
  ],
);
