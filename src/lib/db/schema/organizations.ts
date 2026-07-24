import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { plan } from "./plans";

/**
 * Organization (spec 3.1 — the team/tenant account; langlion: one academy).
 *
 * The shared-tenant counterpart to a personal account. `slug` is a unique
 * internal identifier, kept indexed via its unique constraint. Membership/role live in
 * `membership`; the creator is recorded on `createdByUserId` for audit and is
 * seeded as the first Owner. `deletedAt` supports soft delete + retention (§11.3).
 *
 * TWO IDENTIFIERS, TWO SCOPES (langlion §1.2, decyzja D10). `slug` NO LONGER
 * ROUTES ANYTHING since F4.6: the staff panel moved to `{subdomain}/dashboard`
 * and the active academy is resolved from the request host, so `slug` survives
 * only as an internal handle (§1.2 retires it from panel routing explicitly).
 * It stays editable precisely because nothing a parent sees depends on it.
 * `subdomain` addresses the academy's public site AND its panel
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
 *
 * `plan_id` (F9, EPIK 29) — FK to `plan` table, NOT NULL with default 'trial'.
 * Every organization must have a plan. The trial plan has real free-tier caps
 * (max_students=10, etc.) so enforcement works from day one.
 */
export const organization = pgTable(
  "organization",
  {
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
    /** Plan this organization is on (F9, EPIK 29). NOT NULL, default 'trial'. */
    planId: text("plan_id")
      .notNull()
      .default("trial")
      .references(() => plan.id, { onDelete: "restrict" }),

    // ── Faza 10 — Stripe Connect (EPIK 30) ─────────────────────────────────
    //
    // Stripe Connect columns. Null when no account has been connected yet.
    // `stripe_connect_account_id` has a UNIQUE constraint — one Stripe account
    // may be linked to at most one organization.

    /** ISO 3166-1 alpha-2 country code for Stripe Connect account creation.
     *  Nullable: cash-only orgs never need it. Required before first Connect
     *  onboarding (API returns COUNTRY_REQUIRED if missing). */
    country: text("country"),

    /** The connected Stripe account id (acct_xxx). Non-null once connected. */
    stripeConnectAccountId: text("stripe_connect_account_id"),

    /** Current status of the Connect account, managed exclusively by webhooks. */
    stripeConnectStatus: text("stripe_connect_status")
      .notNull()
      .default("not_connected"),

    /** True when charges are enabled on the connected Stripe account. */
    stripeConnectChargesEnabled: boolean("stripe_connect_charges_enabled")
      .notNull()
      .default(false),

    /** True when payouts are enabled on the connected Stripe account. */
    stripeConnectPayoutsEnabled: boolean("stripe_connect_payouts_enabled")
      .notNull()
      .default(false),

    /** When the account was first confirmed as active via webhook. */
    stripeConnectConnectedAt: timestamp("stripe_connect_connected_at"),

    /** The platform's Stripe customer id for this organization (plan billing). */
    platformStripeCustomerId: text("platform_stripe_customer_id"),

    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => [
    uniqueIndex("organization_stripe_connect_account_uq").on(
      table.stripeConnectAccountId,
    ),
  ],
);
