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

import { location } from "./locations";
import { organization } from "./organizations";

/**
 * Group type — the DEFINITION half of langlion's first governing principle
 * (§0 Zasada nadrzędna #1, §1.2).
 *
 * A template: name, engine, price, payment policy, default location, which
 * purchase and billing modes are allowed. Editing it NEVER propagates backwards
 * into already-generated `session` rows, already-made `booking` rows, or a
 * purchase already in flight. That is why `booking` freezes its own
 * `priceSnapshot` instead of joining back to this table at read time.
 *
 * SCOPE OF `slug` (decyzja D10): unique per organization, not globally. It names
 * an offer *within* an academy — the public URL is
 * `{organization.subdomain}/zapisy/{slug}` — and two academies may both run an
 * "obozy-2026". Global uniqueness would collide between unrelated tenants and
 * leak that another academy's offer exists.
 *
 * Unions are stored as `text` per repo convention (no `pgEnum`), validated in
 * `features/groups/schema.ts`:
 *   engine         "schedule_first" | "availability_first" | "slot_first"
 *   paymentPolicy  "online" | "on_site" | "both"
 *   purchase modes "single_class" | "package"
 *   billing types  "one_time" | "recurring"
 *
 * `policyDocumentId` (§2.18) is deliberately absent — it arrives with F17,
 * together with the table it points at.
 */
export const groupType = pgTable(
  "group_type",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    engine: text("engine")
      .$type<"schedule_first" | "availability_first" | "slot_first">()
      .notNull(),
    paymentPolicy: text("paymentPolicy").$type<"online" | "on_site" | "both">().notNull(),
    /**
     * Minor units of `organization.currency` (§2.14) — grosze, not złote. Integer
     * throughout, matching what Stripe expects, so there is no rounding layer to
     * get wrong. Required with no default: an offer without a price is not an offer.
     */
    price: integer("price").notNull(),
    isNewClientOnly: boolean("isNewClientOnly").notNull().default(false),
    /** Empty/absent = every active trainer is eligible (§1.2). */
    eligibleTrainerIds: text("eligibleTrainerIds").array(),
    defaultLocationId: text("defaultLocationId"),
    /** At least one of "single_class" | "package"; enforced in the zod layer (US-23.1/AC1). */
    allowedPurchaseModes: text("allowedPurchaseModes")
      .array()
      .$type<("single_class" | "package")[]>()
      .notNull(),
    /** Required once "package" is allowed (US-23.2/AC1). */
    allowedBillingTypes: text("allowedBillingTypes").array().$type<("one_time" | "recurring")[]>(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
  },
  (t) => [
    unique("group_type_id_org_uq").on(t.id, t.organizationId),
    unique("group_type_org_slug_uq").on(t.organizationId, t.slug),
    // Composite: a group type's default location must belong to the same academy.
    foreignKey({
      columns: [t.defaultLocationId, t.organizationId],
      foreignColumns: [location.id, location.organizationId],
      name: "group_type_default_location_fk",
    }).onDelete("set null"),
    index("group_type_org_idx").on(t.organizationId),
  ],
);
