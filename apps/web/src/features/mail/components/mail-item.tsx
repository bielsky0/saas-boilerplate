"use client";

import { StarIcon } from "lucide-react";
import { useLocale } from "next-intl";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { enUS, pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatMailDate } from "../mail-config";
import { initialsOf, MAIL_LABEL_STYLES, isMailLabel, type MailThreadSummary } from "../mail-types";

/**
 * One mailbox row (etap 5, faza 5.4). Ported from AdminCN's `MailItem`: avatar,
 * counterpart, relative date, unread weight, thread count, label dots.
 */
export function MailItem({
  thread,
  isSelected,
  onClick,
}: {
  thread: MailThreadSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const locale = useLocale();
  const dateLocale = locale === "pl" ? pl : enUS;
  const name = thread.counterpartName ?? thread.counterpartEmail;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full items-start gap-3 rounded-md border border-transparent p-3 text-left text-sm transition-colors",
        isSelected ? "bg-accent border-border" : "hover:bg-muted/40",
      )}
    >
      <Avatar className="size-10 shrink-0">
        <AvatarFallback>{initialsOf(name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              !thread.isRead ? "text-foreground font-semibold" : "text-foreground/80",
            )}
          >
            {thread.folder === "sent" || thread.folder === "drafts" ? `→ ${name}` : name}
          </span>
          {thread.isStarred && <StarIcon className="fill-primary text-primary size-3.5 shrink-0" />}
          <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
            {formatMailDate(new Date(thread.lastMessageAt), dateLocale)}
          </span>
        </div>
        <p
          className={cn(
            "line-clamp-1 flex items-center justify-between gap-1 text-xs leading-snug",
            !thread.isRead ? "text-foreground font-semibold" : "text-foreground/75",
          )}
        >
          <span className="truncate">
            {thread.subject}
            {thread.messageCount > 1 && (
              <span className="text-muted-foreground ml-1 font-normal">
                ({thread.messageCount})
              </span>
            )}
          </span>
          {thread.labels.length > 0 && (
            <span className="flex shrink-0 justify-end gap-1">
              {thread.labels.filter(isMailLabel).map((label) => (
                <span
                  key={label}
                  className={cn("size-1.5 shrink-0 rounded-full", MAIL_LABEL_STYLES[label])}
                />
              ))}
            </span>
          )}
        </p>
        <p className="text-muted-foreground line-clamp-1 text-[11px] leading-relaxed">
          {thread.preview}
        </p>
      </div>
    </button>
  );
}
