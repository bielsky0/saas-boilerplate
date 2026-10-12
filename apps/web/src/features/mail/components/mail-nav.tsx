"use client";

import {
  ArchiveIcon,
  ArchiveXIcon,
  FileIcon,
  InboxIcon,
  MailIcon,
  SendIcon,
  TrashIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, Separator, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MAIL_FOLDER_ORDER, MAIL_LABEL_ORDER } from "../mail-config";
import {
  MAIL_LABEL_STYLES,
  type MailCounts,
  type MailFolder,
  type MailLabel,
  type MailNavType,
} from "../mail-types";

const FOLDER_ICONS: Record<MailFolder, LucideIcon> = {
  inbox: InboxIcon,
  sent: SendIcon,
  drafts: FileIcon,
  spam: ArchiveXIcon,
  trash: TrashIcon,
  archive: ArchiveIcon,
};

/**
 * Mail navigation (etap 5, faza 5.4) — folders (with per-folder counts) and
 * labels, ported from AdminCN's `MailNav` and wired to live counts.
 */
export function MailNav({
  counts,
  activeFolder,
  activeLabel,
  navType,
  onFolderChange,
  onLabelChange,
  onCompose,
}: {
  counts: MailCounts | undefined;
  activeFolder: MailFolder;
  activeLabel: MailLabel | null;
  navType: MailNavType;
  onFolderChange: (folder: MailFolder) => void;
  onLabelChange: (label: MailLabel) => void;
  onCompose: () => void;
}) {
  const t = useTranslations("mail");

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-3 max-lg:pt-0">
      <div className="p-0 lg:hidden">
        <Button className="w-full" onClick={onCompose}>
          <MailIcon className="mr-2 size-4" />
          {t("compose")}
        </Button>
      </div>

      <div>
        <p className="text-muted-foreground px-2 pb-2.5 text-[11px] font-medium uppercase">
          {t("mailboxes")}
        </p>
        <nav className="grid gap-1">
          {MAIL_FOLDER_ORDER.map((folder) => {
            const Icon = FOLDER_ICONS[folder];
            const isActive = navType === "status" && activeFolder === folder;
            const count = counts?.folders[folder] ?? 0;
            return (
              <Tooltip key={folder}>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      className={cn(
                        "justify-start gap-2.5 px-3",
                        isActive
                          ? "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                          : "text-foreground/80 hover:bg-muted/60",
                      )}
                      onClick={() => onFolderChange(folder)}
                    />
                  }
                >
                  <Icon className="size-4 shrink-0 opacity-70" />
                  {t(`folders.${folder}`)}
                  {count > 0 && (
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      {count}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-2">
                  {t(`folders.${folder}`)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </div>

      <Separator />

      <div>
        <p className="text-muted-foreground px-2 pb-2.5 text-[11px] font-medium uppercase">
          {t("labelsHeading")}
        </p>
        <nav className="grid gap-1">
          {MAIL_LABEL_ORDER.map((label) => {
            const isActive = navType === "label" && activeLabel === label;
            const count = counts?.labels[label] ?? 0;
            return (
              <Tooltip key={label}>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      className={cn(
                        "justify-start gap-2.5 px-3",
                        isActive
                          ? "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                          : "text-foreground/80 hover:bg-muted/60",
                      )}
                      onClick={() => onLabelChange(label)}
                    />
                  }
                >
                  <span className={cn("size-2 shrink-0 rounded-full", MAIL_LABEL_STYLES[label])} />
                  {t(`labels.${label}`)}
                  {count > 0 && (
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      {count}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-2">
                  {t(`labels.${label}`)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
