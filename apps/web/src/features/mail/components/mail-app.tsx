"use client";

import { ArrowDownUpIcon, ChevronLeftIcon, MailIcon, MenuIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  useDeleteThread,
  useMailCounts,
  useMailThread,
  useMailThreads,
  useReply,
  useUpdateThread,
} from "../hooks/use-mail";
import type { MailFilterTab, MailFolder, MailLabel, MailThreadSummary } from "../mail-types";
import { ComposeSheet } from "./compose-sheet";
import { MailDisplay } from "./mail-display";
import { MailList } from "./mail-list";
import { MailNav } from "./mail-nav";

/**
 * Mail app composition (etap 5, faza 5.4) — the AdminCN three-pane layout on
 * live data. Desktop uses `ResizablePanelGroup` (the only consumer of
 * `react-resizable-panels` in the app); mobile collapses to list/detail with the
 * nav in a Sheet. Folder/label/search/unread all key the list query, so the
 * server returns exactly what the pane shows.
 */
export function MailApp() {
  const t = useTranslations("mail");

  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [label, setLabel] = useState<MailLabel | null>(null);
  const [filterTab, setFilterTab] = useState<MailFilterTab>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState<{
    to?: string;
    subject?: string;
    body?: string;
  }>({});
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const navType = label ? "label" : "status";
  const counts = useMailCounts();
  const threadsQuery = useMailThreads({
    folder: label ? "inbox" : folder,
    label: label ?? undefined,
    q: searchQuery || undefined,
    unread: filterTab === "unread",
  });
  const threads = useMemo(() => threadsQuery.data?.items ?? [], [threadsQuery.data]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedId && threads.some((thread) => thread.id === selectedId)) return selectedId;
    return threads[0]?.id ?? null;
  }, [selectedId, threads]);

  const detail = useMailThread(effectiveSelectedId);
  const updateThread = useUpdateThread();
  const deleteThread = useDeleteThread();
  const reply = useReply();

  const activeViewLabel = label ? t(`labels.${label}`) : t(`folders.${folder}`);

  function handleSelect(thread: MailThreadSummary) {
    setSelectedId(thread.id);
    setMobileView("detail");
    if (!thread.isRead) updateThread.mutate({ id: thread.id, patch: { isRead: true } });
  }

  function changeFolder(next: MailFolder) {
    setFolder(next);
    setLabel(null);
    setSelectedId(null);
    setMobileView("list");
    setMobileNavOpen(false);
  }

  function changeLabel(next: MailLabel) {
    setLabel(next);
    setSelectedId(null);
    setMobileView("list");
    setMobileNavOpen(false);
  }

  function openCompose() {
    setComposeInitial({});
    setComposeOpen(true);
  }

  function forwardThread() {
    if (!detail.data) return;
    const participant = detail.data.participants[0];
    setComposeInitial({
      to: participant?.email ?? "",
      subject: `Fwd: ${detail.data.subject}`,
      body: `\n\n---------- ${t("forwarded")} ----------\n${detail.data.messages
        .map((message) => message.body)
        .join("\n\n")}`,
    });
    setComposeOpen(true);
  }

  async function handleReply(body: string) {
    if (!effectiveSelectedId) return;
    try {
      await reply.mutateAsync({ id: effectiveSelectedId, body });
      toast.success(t("toast.replied"));
    } catch {
      toast.error(t("toast.error"));
    }
  }

  function handleDelete() {
    if (!effectiveSelectedId) return;
    deleteThread.mutate(effectiveSelectedId, {
      onSuccess: () => {
        setSelectedId(null);
        setMobileView("list");
        toast.success(t("toast.deleted"));
      },
    });
  }

  const nav = (
    <MailNav
      counts={counts.data}
      activeFolder={folder}
      activeLabel={label}
      navType={navType}
      onFolderChange={changeFolder}
      onLabelChange={changeLabel}
      onCompose={openCompose}
    />
  );

  const listPane = (
    <Tabs
      value={filterTab}
      onValueChange={(value) => setFilterTab(value as MailFilterTab)}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex items-center gap-3 p-3 pb-0">
        <h1 className="text-xl font-bold">{activeViewLabel}</h1>
        <TabsList className="bg-muted/60 ml-auto">
          <TabsTrigger value="all" className="font-normal">
            {t("tabAll")}
          </TabsTrigger>
          <TabsTrigger value="unread" className="font-normal">
            {t("tabUnread")}
            {(counts.data?.unread ?? 0) > 0 ? ` (${counts.data?.unread})` : ""}
          </TabsTrigger>
        </TabsList>
      </div>
      <Separator />
      <div className="flex items-center gap-2 px-3">
        <InputGroup className="relative flex-1">
          <InputGroupAddon>
            <SearchIcon className="size-4" />
            <span className="sr-only">{t("search")}</span>
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder={t("searchPlaceholder")}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="icon" className="shrink-0" title={t("sort")}>
                <ArrowDownUpIcon className="size-4" />
                <span className="sr-only">{t("sort")}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem>{t("sortNewest")}</DropdownMenuItem>
            <DropdownMenuItem>{t("sortOldest")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TabsContent value="all" className="m-0 flex min-h-0 flex-1 flex-col">
        <MailList
          threads={threads}
          isLoading={threadsQuery.isPending}
          selectedId={effectiveSelectedId}
          onSelect={handleSelect}
        />
      </TabsContent>
      <TabsContent value="unread" className="m-0 flex min-h-0 flex-1 flex-col">
        <MailList
          threads={threads}
          isLoading={threadsQuery.isPending}
          selectedId={effectiveSelectedId}
          onSelect={handleSelect}
        />
      </TabsContent>
    </Tabs>
  );

  const displayPane = (
    <MailDisplay
      thread={detail.data}
      isLoading={detail.isPending && Boolean(effectiveSelectedId)}
      onUpdate={(patch) => {
        if (effectiveSelectedId) updateThread.mutate({ id: effectiveSelectedId, patch });
      }}
      onDelete={handleDelete}
      onReply={handleReply}
      onForward={forwardThread}
    />
  );

  return (
    <div className="lg:min-h-130 flex h-[calc(100dvh-15rem)] flex-col lg:h-[calc(100dvh-14rem)]">
      {/* Desktop: three resizable panes. */}
      <div className="hidden h-full lg:flex">
        <ResizablePanelGroup className="border-border bg-background h-full items-stretch overflow-hidden rounded-lg border">
          <ResizablePanel defaultSize="16%" minSize="13%" className="bg-card flex flex-col">
            <div className="p-3">
              <Button className="w-full" onClick={openCompose}>
                <MailIcon className="mr-2 size-4" />
                {t("compose")}
              </Button>
            </div>
            <Separator />
            {nav}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize="30%"
            minSize="24%"
            className="bg-background overflow-hidden! flex min-h-0 flex-col"
          >
            {listPane}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize="54%"
            minSize="32%"
            className="bg-background flex min-h-0 flex-col"
          >
            {displayPane}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: nav behind a sheet, list ↔ detail. */}
      <div className="border-border flex h-full flex-col overflow-hidden rounded-lg border lg:hidden">
        {mobileView === "list" ? (
          <div className="flex h-full flex-col">
            <div className="border-border flex items-center gap-2 border-b px-3 py-2">
              <button
                type="button"
                className="hover:bg-muted rounded-md p-1.5"
                aria-label={t("mailboxes")}
                onClick={() => setMobileNavOpen(true)}
              >
                <MenuIcon className="size-5" />
              </button>
              <h1 className="flex-1 text-lg font-semibold">{activeViewLabel}</h1>
              <Button size="icon-sm" onClick={openCompose} title={t("compose")}>
                <MailIcon className="size-4" />
                <span className="sr-only">{t("compose")}</span>
              </Button>
            </div>
            {listPane}
          </div>
        ) : (
          <div className="relative flex h-full flex-col">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute left-2 top-1.5 z-10 p-0 lg:hidden"
              onClick={() => setMobileView("list")}
            >
              <ChevronLeftIcon className="size-4" />
              {activeViewLabel}
            </Button>
            {displayPane}
          </div>
        )}
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" showCloseButton={false} className={cn("w-72")}>
          <SheetHeader className="sr-only">
            <SheetTitle>{t("mailboxes")}</SheetTitle>
          </SheetHeader>
          {nav}
        </SheetContent>
      </Sheet>

      <ComposeSheet open={composeOpen} onOpenChange={setComposeOpen} initial={composeInitial} />
    </div>
  );
}
