import { check, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";
import { organization } from "./organizations";
import { personalAccount } from "./personal-accounts";

/**
 * Stored file (spec 21.3 — the tenant-owned metadata record for one object).
 *
 * The DB row is the source of truth about WHO owns a file and WHAT it is; the
 * bytes live in the object store behind the storage adapter, addressed by `key`.
 * Every tenant-scoped read filters `isNull(deletedAt)` so a soft-deleted file
 * disappears from the app immediately (spec 21.4) while the object survives until
 * the retention purge sweeps it.
 *
 * OWNER (spec 21.3 → 11.2): a file belongs to an organization OR a personal
 * account, never both and never neither — the same two-nullable-columns + XOR
 * CHECK shape as `billing_customer`. `(a IS NULL) <> (b IS NULL)` is a true XOR
 * with no three-valued-logic hole because `IS NULL` never yields NULL. Both
 * columns are indexed: every listing/read is scoped by one of them.
 *
 * `uploadedByUserId` is `onDelete: "set null"` on purpose: the file belongs to
 * the TENANT, not the uploader, so erasing the person who uploaded it (GDPR,
 * §11.3) must not cascade-delete organization files — it just forgets who did it.
 * This is also what keeps the retention purge self-contained: no file row can
 * block a user hard-delete the way `organization.createdByUserId` (restrict) does.
 *
 * `entityType`/`entityId` are the OPTIONAL link to a specific business record
 * (spec 21.3 — e.g. a document attached to a client). Nullable and unenforced by
 * FK because the target table is product-specific; a feature that uses them
 * validates the reference itself.
 */
export const file = pgTable(
  "file",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    accountId: text("accountId").references(() => personalAccount.id, { onDelete: "cascade" }),
    /** Who uploaded it. Forgotten (not cascaded) when that user is erased. */
    uploadedByUserId: text("uploadedByUserId").references(() => user.id, { onDelete: "set null" }),
    /** Object key in the bucket. Unique — one row per stored object. */
    key: text("key").notNull(),
    /** Filename as the user sent it (display only; never used to build the key). */
    originalName: text("originalName").notNull(),
    contentType: text("contentType").notNull(),
    /** Bytes, as recorded on confirm. */
    size: integer("size").notNull().default(0),
    // visibility: "public" | "private"   (text, validated in app code — no pgEnum,
    // per repo convention). Public = stable URL; private = presigned GET only.
    visibility: text("visibility").$type<"public" | "private">().notNull().default("private"),
    // status: "pending" | "ready"   — a row is created "pending" at presign time
    // and flipped to "ready" once the client confirms the upload landed.
    status: text("status").$type<"pending" | "ready">().notNull().default("pending"),
    /** Optional link to a product-specific business record (spec 21.3). */
    entityType: text("entityType"),
    entityId: text("entityId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    // Soft delete (spec 11.3 / 21.4) — retained until the retention purge sweeps
    // both the row and its object.
    deletedAt: timestamp("deletedAt"),
  },
  (t) => [
    unique("file_key_uq").on(t.key),
    index("file_org_idx").on(t.organizationId),
    index("file_account_idx").on(t.accountId),
    index("file_entity_idx").on(t.entityType, t.entityId),
    check("file_owner_ck", sql`(${t.organizationId} IS NULL) <> (${t.accountId} IS NULL)`),
  ],
);
