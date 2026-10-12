/**
 * Mail DTO mirrors (etap 5, faza 5.4).
 *
 * Source of truth: `apps/api/src/mail/mail.service.ts`. The mail app is
 * USER-scoped (internal user↔user messages) and speaks folders/labels, not
 * tenants.
 */

export const MAIL_FOLDERS = ["inbox", "sent", "drafts", "spam", "trash", "archive"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

export const MAIL_LABELS = ["social", "updates", "forums", "shopping", "promotions"] as const;
export type MailLabel = (typeof MAIL_LABELS)[number];

export type MailNavType = "status" | "label";
export type MailFilterTab = "all" | "unread";

export interface MailThreadSummary {
  id: string;
  subject: string;
  folder: MailFolder;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  messageCount: number;
  lastMessageAt: string;
  preview: string;
  counterpartName: string | null;
  counterpartEmail: string;
}

export interface MailMessageDto {
  id: string;
  body: string;
  createdAt: string;
  fromName: string | null;
  fromEmail: string;
  isFromMe: boolean;
}

export interface MailThreadDetail {
  id: string;
  subject: string;
  folder: MailFolder;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  createdAt: string;
  messages: MailMessageDto[];
  participants: { userId: string; name: string | null; email: string }[];
}

export interface MailThreadsPage {
  items: MailThreadSummary[];
}

export interface MailCounts {
  folders: Record<string, number>;
  labels: Record<string, number>;
  unread: number;
}

export interface MailThreadsQuery {
  folder?: MailFolder;
  label?: MailLabel;
  q?: string;
  unread?: boolean;
  limit?: number;
}

/** Label → dot color, ported from AdminCN's `mailConfig`. */
export const MAIL_LABEL_STYLES: Record<MailLabel, string> = {
  social: "bg-violet-500",
  updates: "bg-teal-500",
  forums: "bg-orange-500",
  shopping: "bg-lime-500",
  promotions: "bg-pink-500",
};

export function isMailLabel(value: string): value is MailLabel {
  return (MAIL_LABELS as readonly string[]).includes(value);
}

export function initialsOf(name: string): string {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
