import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, ilike, inArray } from "drizzle-orm";
import { z } from "zod";

import { mailMessage, mailThread, mailThreadParticipant, user, type Db } from "@repo/db";
import { idParam } from "@repo/validation";
import { DB } from "../db/db.module";
import { badRequest, notFound } from "../common/http";
import { insertJob, type QueueWriter } from "../jobs/queue";
import { kickDrain } from "../jobs/runner";
import type { RequestSession } from "../auth/auth-engine";
import { isMailFolder, MAIL_LABELS, type MailFolder } from "./types";

/**
 * Internal mail (etap 5, faza 5.4).
 *
 * USER-scoped, not tenant-scoped: there is no inbound MX, so this is messaging
 * between platform users (a send to an address with no account is refused — see
 * `resolveRecipients`). Every read and write is keyed by the caller's own
 * participant rows, so one user can never see or touch another's mailbox.
 *
 * A thread is immutable CONTENT (`mail_message`) plus one per-viewer
 * `mail_thread_participant` row. Deleting your copy removes only your row; the
 * thread survives for the other members.
 *
 * Delivery of a new thread runs through the shared job queue (`mail.deliver`,
 * spec 12): the sender's `sent` row and the enqueue commit together, and
 * recipient `inbox` rows appear when the job drains — idempotently, because the
 * queue is at-least-once.
 */

const idParamsSchema = z.object({ id: idParam });

const listQuerySchema = z.object({
  folder: z.string().optional(),
  label: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  unread: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const sendBodySchema = z.object({
  to: z.array(z.string().trim().email()).min(1).max(20),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  draft: z.boolean().optional(),
});

const updateBodySchema = z.object({
  folder: z.string().optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
});

const replyBodySchema = z.object({ body: z.string().trim().min(1).max(20_000) });

const deliverPayloadSchema = z.object({
  threadId: z.string(),
  recipientUserIds: z.array(z.string()),
});

function previewOf(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 140);
}

export interface MailThreadRow {
  id: string;
  subject: string;
  folder: MailFolder;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  messageCount: number;
  lastMessageAt: Date;
  preview: string;
  counterpartName: string | null;
  counterpartEmail: string;
}

interface MessageRow {
  id: string;
  threadId: string;
  body: string;
  createdAt: Date;
  senderUserId: string;
  senderName: string | null;
  senderEmail: string;
}

interface ParticipantRow {
  threadId: string;
  userId: string;
  name: string | null;
  email: string;
}

@Injectable()
export class MailService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Load the raw pieces (threads, messages, participants) for a set of threads. */
  private async loadThreads(threadIds: string[]) {
    if (threadIds.length === 0) {
      return { threads: [], messages: [], participants: [] };
    }
    const [threads, messages, participants] = await Promise.all([
      this.db
        .select({
          id: mailThread.id,
          subject: mailThread.subject,
          createdByUserId: mailThread.createdByUserId,
          lastMessageAt: mailThread.lastMessageAt,
          draftRecipientIds: mailThread.draftRecipientIds,
          createdAt: mailThread.createdAt,
        })
        .from(mailThread)
        .where(inArray(mailThread.id, threadIds)),
      this.db
        .select({
          id: mailMessage.id,
          threadId: mailMessage.threadId,
          body: mailMessage.body,
          createdAt: mailMessage.createdAt,
          senderUserId: mailMessage.senderUserId,
          senderName: user.name,
          senderEmail: user.email,
        })
        .from(mailMessage)
        .innerJoin(user, eq(user.id, mailMessage.senderUserId))
        .where(inArray(mailMessage.threadId, threadIds))
        .orderBy(asc(mailMessage.createdAt)),
      this.db
        .select({
          threadId: mailThreadParticipant.threadId,
          userId: mailThreadParticipant.userId,
          name: user.name,
          email: user.email,
        })
        .from(mailThreadParticipant)
        .innerJoin(user, eq(user.id, mailThreadParticipant.userId))
        .where(inArray(mailThreadParticipant.threadId, threadIds)),
    ]);
    return { threads, messages, participants };
  }

  async listThreads(session: RequestSession, query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) badRequest("INVALID_QUERY");
    const { folder, label, q, unread, limit } = parsed.data;
    const userId = session.user.id;

    const filters = [eq(mailThreadParticipant.userId, userId)];
    if (folder && isMailFolder(folder)) filters.push(eq(mailThreadParticipant.folder, folder));
    if (unread === "1" || unread === "true") filters.push(eq(mailThreadParticipant.isRead, false));
    // A label view is an inbox view narrowed to one label (template semantics).
    if (label) filters.push(eq(mailThreadParticipant.folder, "inbox"));

    const rows = await this.db
      .select({
        threadId: mailThreadParticipant.threadId,
        subject: mailThread.subject,
        folder: mailThreadParticipant.folder,
        isRead: mailThreadParticipant.isRead,
        isStarred: mailThreadParticipant.isStarred,
        labels: mailThreadParticipant.labels,
        lastMessageAt: mailThread.lastMessageAt,
        draftRecipientIds: mailThread.draftRecipientIds,
      })
      .from(mailThreadParticipant)
      .innerJoin(mailThread, eq(mailThread.id, mailThreadParticipant.threadId))
      .where(and(...filters))
      .orderBy(desc(mailThread.lastMessageAt));

    let threadIds = rows.map((row) => row.threadId);
    if (q) {
      const needle = `%${q}%`;
      const [subjectMatches, bodyMatches] = await Promise.all([
        this.db
          .select({ threadId: mailThread.id })
          .from(mailThread)
          .where(and(inArray(mailThread.id, threadIds), ilike(mailThread.subject, needle))),
        this.db
          .select({ threadId: mailMessage.threadId })
          .from(mailMessage)
          .where(and(inArray(mailMessage.threadId, threadIds), ilike(mailMessage.body, needle))),
      ]);
      const matching = new Set<string>([
        ...subjectMatches.map((row) => row.threadId),
        ...bodyMatches.map((row) => row.threadId),
      ]);
      threadIds = threadIds.filter((id) => matching.has(id));
    }

    const { messages, participants } = await this.loadThreads(threadIds);
    const messagesByThread = new Map<string, MessageRow[]>();
    for (const message of messages) {
      const list = messagesByThread.get(message.threadId) ?? [];
      list.push(message);
      messagesByThread.set(message.threadId, list);
    }
    const participantsByThread = new Map<string, ParticipantRow[]>();
    for (const participant of participants) {
      const list = participantsByThread.get(participant.threadId) ?? [];
      list.push(participant);
      participantsByThread.set(participant.threadId, list);
    }

    const rowByThread = new Map(rows.map((row) => [row.threadId, row]));

    // Drafts have no recipient participant rows, so the counterpart for those
    // rows comes from the captured recipient ids — one batched lookup.
    const draftRecipientIds = [
      ...new Set(rows.flatMap((row) => (row.folder === "drafts" ? row.draftRecipientIds : []))),
    ];
    const userById = new Map<string, { name: string | null; email: string }>();
    if (draftRecipientIds.length > 0) {
      const users = await this.db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.id, draftRecipientIds));
      for (const row of users) userById.set(row.id, { name: row.name, email: row.email });
    }

    const items: MailThreadRow[] = [];
    for (const threadId of threadIds) {
      const row = rowByThread.get(threadId);
      if (!row) continue;
      const labels = row.labels ?? [];
      if (label && !labels.includes(label)) continue;
      const threadMessages = messagesByThread.get(threadId) ?? [];
      const threadParticipants = participantsByThread.get(threadId) ?? [];
      const latest = threadMessages[threadMessages.length - 1];
      let counterpartName: string | null = null;
      let counterpartEmail = "";
      const latestOther = [...threadMessages]
        .reverse()
        .find((message) => message.senderUserId !== userId);
      if (latestOther) {
        counterpartName = latestOther.senderName;
        counterpartEmail = latestOther.senderEmail;
      } else {
        const other = threadParticipants.find((participant) => participant.userId !== userId);
        if (other) {
          counterpartName = other.name;
          counterpartEmail = other.email;
        } else {
          const draftRecipient = userById.get(row.draftRecipientIds[0] ?? "");
          if (draftRecipient) {
            counterpartName = draftRecipient.name;
            counterpartEmail = draftRecipient.email;
          }
        }
      }
      items.push({
        id: row.threadId,
        subject: row.subject,
        folder: row.folder as MailFolder,
        isRead: row.isRead,
        isStarred: row.isStarred,
        labels,
        messageCount: threadMessages.length,
        lastMessageAt: row.lastMessageAt,
        preview: latest ? previewOf(latest.body) : "",
        counterpartName,
        counterpartEmail,
      });
    }

    return { items: items.slice(0, limit ?? 100) };
  }

  async counts(session: RequestSession) {
    const rows = await this.db
      .select({
        folder: mailThreadParticipant.folder,
        isRead: mailThreadParticipant.isRead,
        labels: mailThreadParticipant.labels,
      })
      .from(mailThreadParticipant)
      .where(eq(mailThreadParticipant.userId, session.user.id));

    const folders: Record<string, number> = {};
    const labels: Record<string, number> = {};
    let unread = 0;
    for (const row of rows) {
      folders[row.folder] = (folders[row.folder] ?? 0) + 1;
      if (row.folder === "inbox") {
        if (!row.isRead) unread += 1;
        for (const label of row.labels ?? []) {
          labels[label] = (labels[label] ?? 0) + 1;
        }
      }
    }
    return { folders, labels, unread };
  }

  async getThread(session: RequestSession, params: unknown) {
    const parsed = idParamsSchema.safeParse(params);
    if (!parsed.success) badRequest("INVALID_ID");
    const userId = session.user.id;
    const [mine] = await this.db
      .select({
        folder: mailThreadParticipant.folder,
        isRead: mailThreadParticipant.isRead,
        isStarred: mailThreadParticipant.isStarred,
        labels: mailThreadParticipant.labels,
      })
      .from(mailThreadParticipant)
      .where(
        and(
          eq(mailThreadParticipant.threadId, parsed.data.id),
          eq(mailThreadParticipant.userId, userId),
        ),
      )
      .limit(1);
    if (!mine) notFound("THREAD_NOT_FOUND");

    const { threads, messages, participants } = await this.loadThreads([parsed.data.id]);
    const thread = threads[0];
    if (!thread) notFound("THREAD_NOT_FOUND");

    // A draft has no recipient participant rows yet — surface the intended
    // recipients captured at compose time so the To: line is honest.
    let others: ParticipantRow[] = participants.filter(
      (participant) => participant.userId !== userId,
    );
    if (others.length === 0 && thread.draftRecipientIds.length > 0) {
      const draftUsers = await this.db
        .select({ userId: user.id, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.id, thread.draftRecipientIds));
      others = draftUsers.map((row) => ({ threadId: thread.id, ...row }));
    }

    return {
      id: thread.id,
      subject: thread.subject,
      folder: mine.folder,
      isRead: mine.isRead,
      isStarred: mine.isStarred,
      labels: mine.labels ?? [],
      createdAt: thread.createdAt,
      messages: messages.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        fromName: message.senderName,
        fromEmail: message.senderEmail,
        isFromMe: message.senderUserId === userId,
      })),
      participants: others.map((participant) => ({
        userId: participant.userId,
        name: participant.name,
        email: participant.email,
      })),
    };
  }

  /**
   * Map composed addresses to platform users. Unknown addresses are a 422 with
   * the offending field — this is an authenticated internal compose, so
   * "no such user" is the honest answer (unlike signup, where enumeration
   * matters and the connection flow stays neutral).
   */
  private async resolveRecipients(emails: string[]): Promise<string[]> {
    const lowered = [...new Set(emails.map((email) => email.toLowerCase()))];
    const found = await this.db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(inArray(user.email, lowered));
    const foundEmails = new Set(found.map((row) => row.email.toLowerCase()));
    const missing = lowered.filter((email) => !foundEmails.has(email));
    if (missing.length > 0) {
      throw new HttpException(
        { error: "UNKNOWN_RECIPIENT", issues: { to: missing } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return found.map((row) => row.id);
  }

  private async enqueueDelivery(writer: QueueWriter, threadId: string, recipientUserIds: string[]) {
    if (recipientUserIds.length === 0) return;
    await insertJob(writer, "mail.deliver", { threadId, recipientUserIds });
  }

  async send(session: RequestSession, body: unknown) {
    const parsed = sendBodySchema.safeParse(body);
    if (!parsed.success) badRequest("INVALID_BODY");
    const userId = session.user.id;
    const recipientIds = (await this.resolveRecipients(parsed.data.to)).filter(
      (id) => id !== userId,
    );
    const isDraft = parsed.data.draft === true;

    const threadId = await this.db.transaction(async (tx) => {
      const [thread] = await tx
        .insert(mailThread)
        .values({
          subject: parsed.data.subject,
          createdByUserId: userId,
          lastMessageAt: new Date(),
          draftRecipientIds: isDraft ? recipientIds : [],
        })
        .returning({ id: mailThread.id });
      if (!thread) badRequest("INSERT_FAILED");
      await tx.insert(mailThreadParticipant).values({
        threadId: thread.id,
        userId,
        folder: isDraft ? "drafts" : "sent",
        isRead: true,
      });
      await tx.insert(mailMessage).values({
        threadId: thread.id,
        senderUserId: userId,
        body: parsed.data.body,
      });
      if (!isDraft) await this.enqueueDelivery(tx, thread.id, recipientIds);
      return thread.id;
    });

    if (!isDraft) kickDrain();
    return { id: threadId };
  }

  async reply(session: RequestSession, params: unknown, body: unknown) {
    const paramsParsed = idParamsSchema.safeParse(params);
    if (!paramsParsed.success) badRequest("INVALID_ID");
    const parsed = replyBodySchema.safeParse(body);
    if (!parsed.success) badRequest("INVALID_BODY");
    const userId = session.user.id;
    const threadId = paramsParsed.data.id;

    const [mine] = await this.db
      .select({ id: mailThreadParticipant.id })
      .from(mailThreadParticipant)
      .where(
        and(eq(mailThreadParticipant.threadId, threadId), eq(mailThreadParticipant.userId, userId)),
      )
      .limit(1);
    if (!mine) notFound("THREAD_NOT_FOUND");

    const now = new Date();
    const messageId = await this.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(mailMessage)
        .values({ threadId, senderUserId: userId, body: parsed.data.body })
        .returning({ id: mailMessage.id });
      await tx.update(mailThread).set({ lastMessageAt: now }).where(eq(mailThread.id, threadId));
      await tx
        .update(mailThreadParticipant)
        .set({ isRead: true, updatedAt: now })
        .where(eq(mailThreadParticipant.id, mine.id));
      return message?.id;
    });
    if (!messageId) badRequest("INSERT_FAILED");
    return { id: messageId };
  }

  async update(session: RequestSession, params: unknown, body: unknown) {
    const paramsParsed = idParamsSchema.safeParse(params);
    if (!paramsParsed.success) badRequest("INVALID_ID");
    const parsed = updateBodySchema.safeParse(body);
    if (!parsed.success) badRequest("INVALID_BODY");
    const userId = session.user.id;
    const threadId = paramsParsed.data.id;

    const [mine] = await this.db
      .select({ id: mailThreadParticipant.id, folder: mailThreadParticipant.folder })
      .from(mailThreadParticipant)
      .where(
        and(eq(mailThreadParticipant.threadId, threadId), eq(mailThreadParticipant.userId, userId)),
      )
      .limit(1);
    if (!mine) notFound("THREAD_NOT_FOUND");

    const patch: Partial<typeof mailThreadParticipant.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.folder !== undefined) {
      if (!isMailFolder(parsed.data.folder)) badRequest("INVALID_FOLDER");
      patch.folder = parsed.data.folder;
    }
    if (parsed.data.isRead !== undefined) patch.isRead = parsed.data.isRead;
    if (parsed.data.isStarred !== undefined) patch.isStarred = parsed.data.isStarred;
    if (parsed.data.labels !== undefined) {
      if (parsed.data.labels.some((label) => !(MAIL_LABELS as readonly string[]).includes(label))) {
        badRequest("INVALID_LABEL");
      }
      patch.labels = [...new Set(parsed.data.labels)];
    }

    await this.db
      .update(mailThreadParticipant)
      .set(patch)
      .where(eq(mailThreadParticipant.id, mine.id));

    // Sending a draft: fan out to the recipients captured at compose time now
    // (a draft never delivered on save). Same job as a fresh send.
    if (patch.folder === "sent" && mine.folder === "drafts") {
      const [thread] = await this.db
        .select({ draftRecipientIds: mailThread.draftRecipientIds })
        .from(mailThread)
        .where(eq(mailThread.id, threadId))
        .limit(1);
      const recipientIds = (thread?.draftRecipientIds ?? []).filter((id) => id !== userId);
      await this.enqueueDelivery(this.db, threadId, recipientIds);
      await this.db
        .update(mailThread)
        .set({ draftRecipientIds: [], lastMessageAt: new Date() })
        .where(eq(mailThread.id, threadId));
      kickDrain();
    }
    return { ok: true };
  }

  async remove(session: RequestSession, params: unknown) {
    const parsed = idParamsSchema.safeParse(params);
    if (!parsed.success) badRequest("INVALID_ID");
    const userId = session.user.id;
    const threadId = parsed.data.id;
    const [mine] = await this.db
      .select({ id: mailThreadParticipant.id })
      .from(mailThreadParticipant)
      .where(
        and(eq(mailThreadParticipant.threadId, threadId), eq(mailThreadParticipant.userId, userId)),
      )
      .limit(1);
    if (!mine) notFound("THREAD_NOT_FOUND");
    await this.db.delete(mailThreadParticipant).where(eq(mailThreadParticipant.id, mine.id));

    // Last participant left → the thread and its messages have no readers.
    const remaining = await this.db
      .select({ id: mailThreadParticipant.id })
      .from(mailThreadParticipant)
      .where(eq(mailThreadParticipant.threadId, threadId))
      .limit(1);
    if (remaining.length === 0) {
      await this.db.delete(mailThread).where(eq(mailThread.id, threadId));
    }
    return { ok: true };
  }

  /** `mail.deliver` handler (spec 12). Idempotent: at-least-once is the contract. */
  async handleDeliver(payload: unknown): Promise<void> {
    const parsed = deliverPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    if (parsed.data.recipientUserIds.length === 0) return;
    const [thread] = await this.db
      .select({ id: mailThread.id })
      .from(mailThread)
      .where(eq(mailThread.id, parsed.data.threadId))
      .limit(1);
    if (!thread) return;
    await this.db
      .insert(mailThreadParticipant)
      .values(
        parsed.data.recipientUserIds.map((userId) => ({
          threadId: thread.id,
          userId,
          folder: "inbox" as const,
          isRead: false,
        })),
      )
      // A re-delivery (retry) must not clobber a recipient's read/star/labels.
      .onConflictDoNothing({
        target: [mailThreadParticipant.threadId, mailThreadParticipant.userId],
      });
  }
}
