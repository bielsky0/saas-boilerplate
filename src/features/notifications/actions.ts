"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import type { FormState } from "@/lib/validation";
import { withOwner } from "@/lib/db/tenant";
import { markAllRead, markRead, setPreference } from "./data";
import { resolveNotificationOwner } from "./context";
import { markAllReadSchema, markReadSchema } from "./schema";
import { NOTIFICATION_TYPES, isSuppressibleType } from "./types";

/**
 * Notification server actions (spec 23.2 / 23.3). Reads are polled via the route
 * handler; these are the mutations. Mark-read actions resolve the active owner
 * (from the posted `slug`) so a user can only touch their OWN notifications in
 * the context they are acting as; the preference action is per-user (session
 * only). The pattern mirrors `features/organizations/actions.ts`.
 */

/**
 * Mark one notification read. `slug` names the active context (null = personal);
 * `resolveNotificationOwner` re-authorizes it server-side, so the owner scope on
 * `markRead` is what stops a caller clearing someone else's notification.
 *
 * The parse runs BEFORE `resolveNotificationOwner` (§22.2: validation is the
 * entry point, ahead of any authorization side effect). Returning silently on a
 * malformed argument rather than throwing keeps the `void` contract the bell
 * component fires-and-forgets against — a caller sending junk gets nothing done
 * and nothing told, which is the right amount of feedback for a request the UI
 * cannot produce. The `if (id)` guard this replaces did the same job for exactly
 * one of the two arguments.
 */
export async function markReadAction(slug: string | null, id: string): Promise<void> {
  const parsed = markReadSchema.safeParse({ slug, id });
  if (!parsed.success) return;

  const { owner, userId } = await resolveNotificationOwner(parsed.data.slug ?? null);
  await withOwner(owner, (tx) => markRead(tx, userId, owner, parsed.data.id));
}

/** Mark every notification in the active context read. */
export async function markAllReadAction(slug: string | null): Promise<void> {
  const parsed = markAllReadSchema.safeParse({ slug });
  if (!parsed.success) return;

  const { owner, userId } = await resolveNotificationOwner(parsed.data.slug ?? null);
  await withOwner(owner, (tx) => markAllRead(tx, userId, owner));
}

/**
 * Save the in-app channel preferences (spec 23.3). One form, one Save button: for
 * each SUPPRESSIBLE type an unchecked checkbox is absent from the FormData, which
 * reads as "off" — the opt-out. Non-suppressible types are never written (they
 * cannot be muted, by construction — see types.ts).
 *
 * Deliberately has NO schema, unlike its siblings above, and the reason is
 * structural rather than an oversight: this loop never reads a key the client
 * chose. It iterates `NOTIFICATION_TYPES` — a server-side constant — and asks
 * the FormData about each one, so an attacker-supplied field name is not looked
 * up, and an attacker-supplied value is compared against `"on"` and collapses to
 * `false`. There is no input here to hold to a shape; the shape is the loop.
 * Adding a schema would be ceremony that implies a check is happening where the
 * real guarantee is that nothing untrusted is consulted.
 */
export async function updateNotificationPreferencesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();

  for (const type of NOTIFICATION_TYPES) {
    if (!isSuppressibleType(type)) continue;
    const enabled = formData.get(`inApp:${type}`) === "on";
    await setPreference(session.user.id, type, enabled);
  }

  revalidatePath("/settings/notifications");
  return { success: "saved" };
}
