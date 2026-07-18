"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { markAllRead, markRead, setPreference } from "./data";
import { resolveNotificationOwner } from "./context";
import { NOTIFICATION_TYPES, isSuppressibleType } from "./types";

/**
 * Notification server actions (spec 23.2 / 23.3). Reads are polled via the route
 * handler; these are the mutations. Mark-read actions resolve the active owner
 * (from the posted `slug`) so a user can only touch their OWN notifications in
 * the context they are acting as; the preference action is per-user (session
 * only). The pattern mirrors `features/organizations/actions.ts`.
 */

export type ActionState = { error?: string; success?: string };

/**
 * Mark one notification read. `slug` names the active context (null = personal);
 * `resolveNotificationOwner` re-authorizes it server-side, so the owner scope on
 * `markRead` is what stops a caller clearing someone else's notification.
 */
export async function markReadAction(slug: string | null, id: string): Promise<void> {
  const { owner, userId } = await resolveNotificationOwner(slug);
  if (id) await markRead(userId, owner, id);
}

/** Mark every notification in the active context read. */
export async function markAllReadAction(slug: string | null): Promise<void> {
  const { owner, userId } = await resolveNotificationOwner(slug);
  await markAllRead(userId, owner);
}

/**
 * Save the in-app channel preferences (spec 23.3). One form, one Save button: for
 * each SUPPRESSIBLE type an unchecked checkbox is absent from the FormData, which
 * reads as "off" — the opt-out. Non-suppressible types are never written (they
 * cannot be muted, by construction — see types.ts).
 */
export async function updateNotificationPreferencesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();

  for (const type of NOTIFICATION_TYPES) {
    if (!isSuppressibleType(type)) continue;
    const enabled = formData.get(`inApp:${type}`) === "on";
    await setPreference(session.user.id, type, enabled);
  }

  revalidatePath("/settings/notifications");
  return { success: "saved" };
}
