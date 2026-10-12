import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Internal mail (etap 5, faza 5.4).
 *
 * Scope is the USER, not the tenant: the boilerplate has no inbound MX, so this
 * is user↔user messaging inside the product (spec decision — "internal
 * messages only", physics not a cut). A thread is a set of messages plus one
 * `mail_thread_participant` row PER member — that row carries everything
 * per-viewer (folder, read/starred, labels), which is why it is separate from
 * the immutable `mail_message` content. Deleting your copy deletes only your
 * participant row; the thread survives for everyone else.
 *
 * Folders carry no pgEnum (repo convention): a `text` + CHECK bounds the set at
 * the database, which is stricter than the app layer needs but keeps a typo
 * from becoming a folder nothing can ever list.
 *
 * Delivery of a new thread to recipients runs as the `mail.deliver` job (spec 12
 * queue), so a send is a transactional outbox write — the sender's `sent` row
 * commits with the enqueue, and recipient `inbox` rows land when it drains.
 */

export const mailThread = pgTable(
  "mail_thread",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Subject from the opening message; replies keep the thread subject. */
    subject: text("subject").notNull(),
    /** Who opened the thread. Restrict: an author cannot be erased out of history. */
    createdByUserId: text("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Denormalized ordering key — the list sorts by this, never by a join. */
    lastMessageAt: timestamp("lastMessageAt").notNull().defaultNow(),
    /**
     * Intended recipients of a DRAFT (user ids), captured at compose time and
     * cleared once the draft is sent. Without it a draft could never deliver:
     * recipients get no participant row until delivery, so the send has nobody
     * to fan out to.
     */
    draftRecipientIds: jsonb("draftRecipientIds").$type<string[]>().notNull().default([]),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("mail_thread_last_idx").on(t.lastMessageAt)],
);

export const mailThreadParticipant = pgTable(
  "mail_thread_participant",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: text("threadId")
      .notNull()
      .references(() => mailThread.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Where the thread sits in THIS user's mailbox. */
    folder: text("folder").notNull().default("inbox"),
    isRead: boolean("isRead").notNull().default(false),
    isStarred: boolean("isStarred").notNull().default(false),
    /** Free-form labels (the five AdminCN ones today); validated in app code. */
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mail_participant_thread_user_uq").on(t.threadId, t.userId),
    index("mail_participant_user_folder_idx").on(t.userId, t.folder, t.updatedAt),
    check(
      "mail_participant_folder_ck",
      sql`${t.folder} IN ('inbox', 'sent', 'drafts', 'spam', 'trash', 'archive')`,
    ),
  ],
);

export const mailMessage = pgTable(
  "mail_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: text("threadId")
      .notNull()
      .references(() => mailThread.id, { onDelete: "cascade" }),
    senderUserId: text("senderUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("mail_message_thread_idx").on(t.threadId, t.createdAt)],
);
