import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Better Auth identity tables (spec 2 — authentication).
 *
 * These four tables are the auth substrate consumed by the Better Auth Drizzle
 * adapter (see `src/lib/adapters/auth/better-auth.ts`). Table and column names
 * match Better Auth's default schema exactly — do not rename without also
 * mapping them in the adapter config.
 *
 * TENANT-ISOLATION CARVE-OUT: unlike business entities, these identity tables
 * intentionally do NOT carry an `organization_id`/`account_id` owner column
 * (spec 11.2). They are the identity layer on top of which multi-tenancy (§3)
 * is later built — a user exists before any tenant does. This is the one
 * documented exception to the tenant-owner rule in `schema/index.ts`.
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

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
