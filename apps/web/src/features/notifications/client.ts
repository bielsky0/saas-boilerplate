/**
 * Browser-side notification mutations (spec 23.2) — same-origin fetch against
 * the thin proxy routes in `src/app/api/notifications/*`, which forward to
 * Nest with the session cookie. The browser needs no client config: cookies
 * ride along automatically.
 *
 * Fire-and-forget like the server actions these replace: the bell updates
 * optimistically and reconciles on the next poll, so a failed call resolves
 * silently instead of surfacing a toast for a dot.
 */

function withSlug(path: string, slug: string | null): string {
  return slug ? `${path}?slug=${encodeURIComponent(slug)}` : path;
}

/** Mark one notification read in the active context (null slug = personal). */
export async function markNotificationRead(slug: string | null, id: string): Promise<void> {
  try {
    await fetch(withSlug(`/api/notifications/${encodeURIComponent(id)}/read`, slug), {
      method: "PATCH",
    });
  } catch {
    // Transient network error — the next poll reconciles. Nothing user-facing.
  }
}

/** Mark every notification in the active context read. */
export async function markAllNotificationsRead(slug: string | null): Promise<void> {
  try {
    await fetch(withSlug("/api/notifications/read-all", slug), { method: "PATCH" });
  } catch {
    // Same as above.
  }
}
