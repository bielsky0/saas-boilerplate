"use client";

import {
  Archive,
  ChevronDown,
  Forward,
  Inbox,
  MoreVertical,
  Reply,
  ReplyAll,
  SendIcon,
  ShieldAlert,
  ShieldCheck,
  StarIcon,
  Tag,
  Trash2,
} from "lucide-react";
import { enUS, pl } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Separator,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatMailDate, MAIL_LABEL_ORDER } from "../mail-config";
import {
  initialsOf,
  isMailLabel,
  MAIL_LABEL_STYLES,
  type MailMessageDto,
  type MailThreadDetail,
} from "../mail-types";
import type { UpdateThreadInput } from "../hooks/use-mail";

const LABEL_MANAGE_FOLDERS = new Set(["inbox", "sent", "archive"]);

/** A tooltip-wrapped icon button — the display toolbar's unit. */
function ToolbarButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(destructive && "text-destructive hover:text-destructive")}
          />
        }
      >
        {children}
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ThreadMessage({
  message,
  variant = "card",
}: {
  message: MailMessageDto;
  variant?: "card" | "plain";
}) {
  const locale = useLocale();
  const dateLocale = locale === "pl" ? pl : enUS;
  const t = useTranslations("mail");
  const name = message.isFromMe ? t("you") : (message.fromName ?? message.fromEmail);

  const content = (
    <>
      <div className="mb-4 flex items-start gap-3">
        <Avatar className="size-9 shrink-0">
          <AvatarFallback>{initialsOf(name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{name}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatMailDate(new Date(message.createdAt), dateLocale)}
            </span>
          </div>
          <div className="text-muted-foreground text-xs">{message.fromEmail}</div>
        </div>
      </div>
      <div className="text-foreground/80 whitespace-pre-wrap text-sm">{message.body}</div>
    </>
  );

  if (variant === "plain") return <div className="px-3">{content}</div>;
  return <div className="border-border/60 bg-muted/20 rounded-lg border p-4">{content}</div>;
}

/**
 * Mail detail pane (etap 5, faza 5.4). Ported from AdminCN's display: a folder
 * action bar (archive / spam / restore / trash / delete / labels / star), the
 * thread body, and an inline reply box. Every action is a real mutation — no
 * dead buttons. Star, read-state and labels go through `onUpdate`; the folder
 * moves too, so the list reflects them immediately.
 */
export function MailDisplay({
  thread,
  isLoading,
  onUpdate,
  onDelete,
  onReply,
  onForward,
}: {
  thread: MailThreadDetail | undefined;
  isLoading: boolean;
  onUpdate: (patch: UpdateThreadInput) => void;
  onDelete: () => void;
  onReply: (body: string) => Promise<void> | void;
  onForward: () => void;
}) {
  const t = useTranslations("mail");
  const locale = useLocale();
  const dateLocale = locale === "pl" ? pl : enUS;
  const name = thread
    ? (thread.participants[0]?.name ?? thread.participants[0]?.email ?? thread.subject)
    : "";
  const [replyBody, setReplyBody] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !thread) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-foreground text-sm font-medium">
          {isLoading ? t("loading") : t("noSelection.title")}
        </p>
        {!isLoading && <p className="text-xs">{t("noSelection.body")}</p>}
      </div>
    );
  }

  const isDraft = thread.folder === "drafts";
  const isSent = thread.folder === "sent";
  const canManageLabels = LABEL_MANAGE_FOLDERS.has(thread.folder);
  const earlier = thread.messages.slice(0, -1);
  const latest = thread.messages[thread.messages.length - 1];
  const recipientLabel = isSent || isDraft ? t("to") : t("replyTo");

  async function submitReply(event: React.FormEvent) {
    event.preventDefault();
    if (!replyBody.trim()) return;
    await onReply(replyBody.trim());
    setReplyBody("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="lg:h-15 flex items-center gap-1 p-1 max-lg:justify-end lg:p-3">
        <div className="hidden items-center lg:flex">
          {(thread.folder === "inbox" || isSent || isDraft) && (
            <ToolbarButton
              label={t("actions.archive")}
              onClick={() => onUpdate({ folder: "archive" })}
            >
              <Archive className="size-4" />
            </ToolbarButton>
          )}
          {thread.folder === "inbox" && (
            <ToolbarButton label={t("actions.spam")} onClick={() => onUpdate({ folder: "spam" })}>
              <ShieldAlert className="size-4" />
            </ToolbarButton>
          )}
          {thread.folder === "spam" && (
            <ToolbarButton
              label={t("actions.notSpam")}
              onClick={() => onUpdate({ folder: "inbox" })}
            >
              <ShieldCheck className="size-4" />
            </ToolbarButton>
          )}
          {(thread.folder === "trash" || thread.folder === "archive") && (
            <ToolbarButton
              label={t("actions.restore")}
              onClick={() => onUpdate({ folder: "inbox" })}
            >
              <Inbox className="size-4" />
            </ToolbarButton>
          )}
          {thread.folder !== "trash" && (
            <ToolbarButton label={t("actions.trash")} onClick={() => onUpdate({ folder: "trash" })}>
              <Trash2 className="size-4" />
            </ToolbarButton>
          )}
          {(thread.folder === "spam" || thread.folder === "trash") && (
            <ToolbarButton label={t("actions.delete")} destructive onClick={onDelete}>
              <Trash2 className="size-4" />
            </ToolbarButton>
          )}

          {canManageLabels && (
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="ghost" size="icon" title={t("actions.labels")}>
                    <Tag className="size-4" />
                    <span className="sr-only">{t("actions.labels")}</span>
                  </Button>
                }
              />
              <PopoverContent align="start" className="flex w-44 flex-col gap-1 p-1">
                {MAIL_LABEL_ORDER.map((label) => {
                  const active = thread.labels.filter(isMailLabel).includes(label);
                  return (
                    <Button
                      key={label}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => {
                        const next = active
                          ? thread.labels.filter(
                              (value): value is typeof label =>
                                isMailLabel(value) && value !== label,
                            )
                          : [...thread.labels.filter(isMailLabel), label];
                        onUpdate({ labels: next });
                      }}
                    >
                      <span
                        className={cn("size-2.5 shrink-0 rounded-full", MAIL_LABEL_STYLES[label])}
                      />
                      <span className="flex-1 text-left">{t(`labels.${label}`)}</span>
                      {active && <span aria-hidden="true">✓</span>}
                    </Button>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
        </div>

        <Separator
          orientation="vertical"
          className="data-vertical:self-center hidden h-6 lg:block"
        />
        <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
          <ToolbarButton
            label={thread.isStarred ? t("actions.unstar") : t("actions.star")}
            onClick={() => onUpdate({ isStarred: !thread.isStarred })}
          >
            <StarIcon className={cn("size-4", thread.isStarred && "fill-primary text-primary")} />
          </ToolbarButton>
          {thread.labels.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {thread.labels.filter(isMailLabel).map((label) => (
                <Badge key={label} variant="outline" className="gap-1 px-1.5">
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", MAIL_LABEL_STYLES[label])}
                  />
                  <span className="max-xl:hidden">{t(`labels.${label}`)}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <ToolbarButton
            label={t("actions.reply")}
            disabled={isSent || isDraft}
            onClick={() => setReplyBody("")}
          >
            <Reply className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t("actions.replyAll")}
            disabled={isSent || isDraft}
            onClick={() => setReplyBody("")}
          >
            <ReplyAll className="size-4" />
          </ToolbarButton>
          <ToolbarButton label={t("actions.forward")} onClick={onForward}>
            <Forward className="size-4" />
          </ToolbarButton>
          <Separator orientation="vertical" className="data-vertical:self-center mx-1 h-6" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" title={t("actions.more")}>
                  <MoreVertical className="size-4" />
                  <span className="sr-only">{t("actions.more")}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onUpdate({ isRead: !thread.isRead })}>
                {thread.isRead ? t("actions.markUnread") : t("actions.markRead")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpdate({ isStarred: !thread.isStarred })}>
                {thread.isStarred ? t("actions.unstar") : t("actions.star")}
              </DropdownMenuItem>
              {isDraft && (
                <DropdownMenuItem onClick={() => onUpdate({ folder: "sent" })}>
                  {t("actions.sendDraft")}
                </DropdownMenuItem>
              )}
              {thread.folder !== "trash" && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onUpdate({ folder: "trash" })}
                >
                  {t("actions.trash")}
                </DropdownMenuItem>
              )}
              {(thread.folder === "spam" || thread.folder === "trash") && (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  {t("actions.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Separator />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-border border-b p-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Avatar className="size-10 shrink-0 max-md:hidden">
                <AvatarFallback>{initialsOf(name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h2 className="text-foreground line-clamp-2 text-base font-medium leading-snug tracking-tight md:font-semibold">
                  {thread.subject}
                </h2>
                <p className="text-foreground mt-1 truncate text-sm font-medium">
                  <span className="text-muted-foreground font-normal">{recipientLabel}: </span>
                  {name}
                </p>
                {thread.participants[0]?.email && (
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {thread.participants[0].email}
                  </p>
                )}
              </div>
            </div>
            <span className="text-muted-foreground shrink-0 pt-0.5 text-xs">
              {formatMailDate(new Date(thread.createdAt), dateLocale)}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          <div className="flex flex-col gap-5">
            {earlier.length > 0 && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-sm font-medium transition-colors"
                onClick={() => setExpanded((value) => !value)}
              >
                <ChevronDown
                  className={cn("size-4 transition-transform", expanded && "rotate-180")}
                />
                {t("earlierMessages", { count: earlier.length })}
              </button>
            )}
            {expanded &&
              earlier.map((message) => <ThreadMessage key={message.id} message={message} />)}
            {latest && <ThreadMessage message={latest} variant="plain" />}
          </div>
        </div>

        <div className="border-border mt-auto border-t p-3">
          <form onSubmit={submitReply}>
            <div className="border-border bg-muted/20 overflow-hidden rounded-lg border">
              <Textarea
                className="resize-none rounded-none border-0 bg-transparent p-2 text-sm shadow-none focus-visible:ring-0 max-md:min-h-10 md:px-4 md:py-3"
                placeholder={isDraft ? t("replyPlaceholderDraft") : t("replyPlaceholder", { name })}
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
              />
              <div className="border-border flex items-center justify-between border-t p-2 md:px-4 md:py-2.5">
                <div className="flex items-center gap-2">
                  <Switch id="mute-thread" />
                  <label htmlFor="mute-thread" className="text-muted-foreground text-sm">
                    {t("muteThread")}
                  </label>
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 rounded-lg px-4"
                  disabled={!replyBody.trim()}
                >
                  {t("send")}
                  <SendIcon className="size-4" />
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
