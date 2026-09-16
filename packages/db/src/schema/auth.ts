import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Better Auth identity tables (spec 2 — authentication).
 *
 * These four tables are the auth substrate consumed by the Better Auth Drizzle
 * adapter (see `src/lib/adapters/auth/better-auth.ts`). Table and column names
 * match Better Auth's default schema exactly — do not rename without also
 * mapping them in the adapter config.
 *
 * Two groups of columns here come from the engine's `admin` plugin (spec 6),
 * whose shape is fixed by `better-auth/plugins/admin/schema.mjs`:
 *   - `user.role` / `user.banned` / `user.banReason` / `user.banExpires`
 *   - `session.impersonatedBy`
 * `user.role` is the SINGLE source of truth for the system-level super-admin
 * flag (spec 6.1). It is deliberately NOT a boolean `isSuperAdmin` column: the
 * plugin's own authorization gate reads this string, so a second column could
 * drift out of sync with the gate that actually decides. The vendor vocabulary
 * ("superadmin") stops at the adapter — `SessionUser.isSuperAdmin` is derived
 * there, and nothing outside `better-auth.ts` ever sees the string (§1.2).
 * NOTE this is a SYSTEM role and has nothing to do with `membership.role`
 * (§4, org-scoped); the two vocabularies are kept disjoint on purpose.
 *
 * `user.deletedAt` and `user.locale` are the two columns in this file that are
 * OURS, not the engine's. `deletedAt` carries soft delete + retention (§11.3) for
 * the identity record, mirroring `organization.deletedAt`. Both are declared to
 * the engine via `user.additionalFields` in the adapter so they ride along on the
 * session user at no extra query cost — which is what lets `getSession` return
 * null for a deleted account without a second round-trip.
 *
 * TENANT-ISOLATION CARVE-OUT: unlike business entities, these identity tables
 * intentionally do NOT carry an `organization_id`/`account_id` owner column
 * (spec 11.2). They are the identity layer on top of which multi-tenancy (§3)
 * is later built — a user exists before any tenant does. This is the first of
 * the two documented exceptions to the tenant-owner rule in `schema/index.ts`.
 *
 * The three `oauth*` tables at the bottom are the engine's `mcp`/`oidc-provider`
 * plugin substrate (spec 26 — AI Agent). They turn the app into an OAuth 2.0
 * authorization server so an MCP client (e.g. Claude) can obtain a per-USER
 * access token and act on that user's behalf through the same RBAC path as the
 * UI. Their shape is fixed by `better-auth/plugins/oidc-provider/schema.mjs` —
 * do not rename columns without also remapping them in the adapter config. Same
 * carve-out as above: they are identity/credential infrastructure, keyed by a
 * system credential (the OAuth token), not a tenant owner.
 */

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    // --- admin plugin (spec 6) ---
    // Stored value must match `adminRoles` EXACTLY: the plugin's target-is-admin
    // check does a case-sensitive `includes`, unlike its constructor validation.
    role: text("role").notNull().default("user"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("banReason"),
    banExpires: timestamp("banExpires"),
    // --- ours (spec 11.3) ---
    deletedAt: timestamp("deletedAt"),
    /**
     * The user's chosen language (spec 16.1) — the DURABLE store behind the
     * request-time locale cookie.
     *
     * NULLABLE WITH NO DEFAULT, and both halves are deliberate. `NULL` means "this
     * person has never told us", which is a different fact from "this person chose
     * English" — and the two must stay different, because only the second may
     * override what their browser asks for. A `.default('en')` would assert a
     * preference we were never given, and would silently pin every existing user
     * to English at migration time.
     *
     * Not an enum: locales are an application concern (`LOCALES` in
     * src/lib/i18n/config.ts), and adding a language should not need a migration.
     * The column is only ever written through `setLocaleAction`, which validates
     * against that list; readers narrow with `isLocale` and fall back.
     *
     * This is what lets a §10.3 email sent a week from now be written in the right
     * language: the cookie is gone by then, but the row is not.
     */
    locale: text("locale"),
  },
  (t) => [
    // Backs the admin user list's default ordering (spec 6.2).
    index("user_created_idx").on(t.createdAt.desc()),
    index("user_deleted_idx").on(t.deletedAt),
  ],
);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Id of the admin who opened this session by impersonating `userId` (spec 6.2).
  // No FK: the plugin's schema declares a plain string, and matching it exactly
  // keeps the engine's own writes valid. A property of the SESSION, not the user.
  impersonatedBy: text("impersonatedBy"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // OAuth token columns are unused by email/password but kept in place so the
  // schema is ready for the OAuth phase without a follow-up migration.
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  // Hashed credential password (Better Auth uses scrypt). Null for OAuth-only
  // accounts. Never stored or logged in plain text (spec 2.1).
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * OAuth 2.0 authorization-server tables (spec 26 — AI Agent / MCP).
 *
 * Owned by the engine's `mcp` + `oidc-provider` plugins; shape mirrors
 * `better-auth/plugins/oidc-provider/schema.mjs` exactly. A `required` field
 * there → `.notNull()` here; `required: false` → nullable. An MCP client registers
 * as an `oauthApplication` (dynamic client registration), the user grants an
 * `oauthConsent`, and the resulting `oauthAccessToken` — carrying the user id — is
 * what `withMcpAuth` resolves on every `/api/mcp` call.
 */
export const oauthApplication = pgTable("oauthApplication", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  metadata: text("metadata"),
  clientId: text("clientId").notNull().unique(),
  clientSecret: text("clientSecret"),
  redirectUrls: text("redirectUrls").notNull(),
  type: text("type").notNull(),
  disabled: boolean("disabled").notNull().default(false),
  // Nullable: a client can be registered without being tied to a single user.
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const oauthAccessToken = pgTable("oauthAccessToken", {
  id: text("id").primaryKey(),
  accessToken: text("accessToken").notNull().unique(),
  refreshToken: text("refreshToken").unique(),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt").notNull(),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt").notNull(),
  // FK to the application's business key (`clientId`), not its `id`.
  clientId: text("clientId")
    .notNull()
    .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
  // The acting user (spec 26.1): this is what pins every MCP call to one identity.
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const oauthConsent = pgTable("oauthConsent", {
  id: text("id").primaryKey(),
  clientId: text("clientId")
    .notNull()
    .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  consentGiven: boolean("consentGiven").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
