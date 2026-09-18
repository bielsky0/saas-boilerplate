/**
 * Browser-side notification calls (spec 23.2, faza 3.2) — direct fetches
 * against the main API (`NEXT_PUBLIC_API_BASE_URL + /v1/notifications*`,
 * `credentials: "include"`, CORS). Same shapes the thin `app/api` relays
 * used to pass through, so callers see no difference.
 *
 * Fire-and-forget like the server actions these replace: the bell updates
 * optimistically and reconciles on the next poll, so a failed call resolves
 * silently instead of surfacing a toast for a dot.
 */

import { clientEnv } from "@/lib/env/client";

function apiBase(): string {
  return clientEnv.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
}

function withSlug(path: string, slug: string | null): string {
  return slug ? `${path}?slug=${encodeURIComponent(slug)}` : path;
}

export interface NotificationItem {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  unreadCount: number;
  items: NotificationItem[];
}

/** Poll the bell state in the active context (null slug = personal). */
export async function fetchNotifications(slug: string | null): Promise<NotificationList | null> {
  try {
    const res = await fetch(`${apiBase()}${withSlug("/v1/notifications", slug)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as NotificationList;
  } catch {
    // Transient network error — the next tick retries. Nothing user-facing.
    return null;
  }
}

/** Mark one notification read in the active context (null slug = personal). */
export async function markNotificationRead(slug: string | null, id: string): Promise<void> {
  try {
    await fetch(
      `${apiBase()}${withSlug(`/v1/notifications/${encodeURIComponent(id)}/read`, slug)}`,
      {
        method: "PATCH",
        credentials: "include",
      },
    );
  } catch {
    // Transient network error — the next poll reconciles. Nothing user-facing.
  }
}

/** Mark every notification in the active context read. */
export async function markAllNotificationsRead(slug: string | null): Promise<void> {
  try {
    await fetch(`${apiBase()}${withSlug("/v1/notifications/read-all", slug)}`, {
      method: "PATCH",
      credentials: "include",
    });
  } catch {
    // Same as above.
  }
}
