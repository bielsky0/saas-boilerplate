import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Organization (spec 3.1 — the team/tenant account; langlion: one academy).
 *
 * The shared-tenant counterpart to a personal account. `slug` is the unique,
 * URL-facing identifier: the active org context is derived from `/orgs/[slug]`
 * (spec 3.5), so it is indexed via its unique constraint. Membership/role live in
 * `membership`; the creator is recorded on `createdByUserId` for audit and is
 * seeded as the first Owner. `deletedAt` supports soft delete + retention (§11.3).
 *
 * TWO IDENTIFIERS, TWO SCOPES (langlion §1.2, decyzja D10). `slug` routes the
 * staff panel at `/orgs/[slug]`. `subdomain` addresses the academy's public site
 * at `{subdomain}.langlion.com`, under which its registration links live as
 * `/zapisy/{group_type.slug}`. They are separate columns because they answer to
 * different constraints — DNS for one, internal routing for the other — and
 * collapsing them would make a future DNS rule silently rewrite panel URLs.
 * Note the pairing of scopes: `subdomain` is unique GLOBALLY (DNS demands it),
 * while `group_type.slug` is unique only per organization, because two academies
 * may legitimately both run an "obozy-2026" offer.
 *
 * `timezone` and `currency` are langlion-required and deliberately have NO
 * database default (Constraint 5, US-24.1/AC1): a default would let an academy be
 * created with a quietly wrong currency, and currency is effectively immutable
 * once transactional data exists. Same reasoning for `subdomain` — it is a
 * deliberate choice at creation time, never derived from `name`, because academy
 * names collide in practice.
 */
export const organization = pgTable("organization", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** DNS label for the academy's public site. Globally unique — see header. */
  subdomain: text("subdomain").notNull().unique(),
  /** IANA zone, e.g. `Europe/Warsaw`. One academy = one timezone (langlion §1.2). */
  timezone: text("timezone").notNull(),
  /** ISO 4217, e.g. `PLN`. One academy = one currency; amounts are minor units (§2.14). */
  currency: text("currency").notNull(),
  logo: text("logo"),
  createdByUserId: text("createdByUserId")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  deletedAt: timestamp("deletedAt"),
});
