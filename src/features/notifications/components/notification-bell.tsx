"use client";

import { Bell } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { markAllReadAction, markReadAction } from "../actions";
import { isNotificationType } from "../types";

/**
 * Global notification bell (spec 23.2 / 23.4). Polls the notifications endpoint —
 * WebSocket is deliberately out of scope for a dual serverless/standalone target
 * (spec 23.4 permits polling). Context comes from the URL slug, matching the
 * account switcher, so switching org changes what the bell shows. Text is
 * rendered from `type` + `params` in the VIEWER's current locale (spec 16), never
 * stored pre-rendered.
 */

const POLL_MS = 15_000;

type Item = {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function slugFromPath(pathname: string): string | null {
  // Path here has no locale prefix (i18n `usePathname`), e.g. `/orgs/acme/...`.
  return pathname.startsWith("/orgs/") ? (pathname.split("/")[2] ?? null) : null;
}

export function NotificationBell() {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const slug = slugFromPath(pathname);

  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/notifications${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`,
      );
      if (!res.ok) return;
      const data: { unreadCount: number; items: Item[] } = await res.json();
      setUnread(data.unreadCount);
      setItems(data.items);
    } catch {
      // Transient network error — the next tick retries. Nothing user-facing.
    }
  }, [slug]);

  useEffect(() => {
    // Both the first load and the poll run from timer callbacks (an external
    // subscription), never a synchronous setState in the effect body.
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  function labelFor(item: Item, field: "title" | "body"): string {
    if (!isNotificationType(item.type)) return "";
    return t(`types.${item.type}.${field}`, item.params);
  }

  async function open(item: Item) {
    // Optimistic: clear the dot immediately, reconcile on the next poll.
    if (!item.readAt) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, readAt: "now" } : i)));
      setUnread((n) => Math.max(0, n - 1));
    }
    await markReadAction(slug, item.id);
    if (item.link) {
      // verify-email links are absolute (a full app URL); everything else is an
      // app-relative route the locale-aware router can take.
      if (/^https?:\/\//.test(item.link)) window.location.assign(item.link);
      else router.push(item.link);
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? "now" })));
    setUnread(0);
    await markAllReadAction(slug);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("bell.label")} className="relative">
          <Bell className="size-4" />
          {unread > 0 ? (
            <span
              aria-hidden
              className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-1">
          <DropdownMenuLabel className="px-0">{t("bell.title")}</DropdownMenuLabel>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAll}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              {t("bell.markAllRead")}
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{t("bell.empty")}</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void open(item)}
                  className="hover:bg-accent flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {!item.readAt ? (
                      <span aria-hidden className="bg-destructive size-2 shrink-0 rounded-full" />
                    ) : null}
                    <span className={cn("text-sm", !item.readAt && "font-medium")}>
                      {labelFor(item, "title")}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">{labelFor(item, "body")}</span>
                  <span className="text-muted-foreground/70 text-[11px]">
                    {format.relativeTime(new Date(item.createdAt))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItemLink href="/settings/notifications">
          {t("bell.settings")}
        </DropdownMenuItemLink>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A dropdown footer link — a plain locale-aware Link styled like a menu row. */
function DropdownMenuItemLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="hover:bg-accent text-muted-foreground hover:text-foreground block rounded-sm px-3 py-1.5 text-sm transition-colors"
    >
      {children}
    </Link>
  );
}
