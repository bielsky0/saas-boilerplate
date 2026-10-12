"use client";

import { InboxIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { MailThreadSummary } from "../mail-types";
import { MailItem } from "./mail-item";

/**
 * Mailbox list (etap 5, faza 5.4) — scrollable thread rows with an empty state.
 */
export function MailList({
  threads,
  isLoading,
  selectedId,
  onSelect,
}: {
  threads: MailThreadSummary[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (thread: MailThreadSummary) => void;
}) {
  const t = useTranslations("mail");

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">{t("loading")}</p>;
  }

  if (threads.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <InboxIcon className="text-muted-foreground/40 size-9" />
        <p className="text-foreground text-sm font-medium">{t("empty.title")}</p>
        <p className="text-xs">{t("empty.body")}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col p-3 pt-0">
        {threads.map((thread) => (
          <MailItem
            key={thread.id}
            thread={thread}
            isSelected={selectedId === thread.id}
            onClick={() => onSelect(thread)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
